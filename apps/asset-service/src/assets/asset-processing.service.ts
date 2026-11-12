import { Injectable } from '@nestjs/common';
import { validate as isUuid } from 'uuid';
import { CatalogService } from '../catalog/catalog.service';
import { MAX_FAILURE_REASON_LENGTH } from './assets.constants';
import type { AssetVersion } from './domain/asset-version.interface';
import { AssetVersionStatus } from './domain/asset-version-status.enum';
import type { ProcessingOutcome } from './domain/processing-outcome.type';
import { AssetVersionNotFoundException } from './exceptions/asset-version-not-found.exception';
import { InvalidAssetVersionIdException } from './exceptions/invalid-asset-version-id.exception';
import { InvalidProcessingResultException } from './exceptions/invalid-processing-result.exception';
import { ProcessingStateConflictException } from './exceptions/processing-state-conflict.exception';
import { AssetVersionsRepository } from './infrastructure/asset-versions.repository';

/**
 * Processing lifecycle reported by the worker: UPLOADED -> PROCESSING -> READY | FAILED.
 *
 * Kafka delivers at least once and the worker retries after timeouts, so every call
 * must be safe to repeat: repeating a step that already happened returns the current
 * state; only a *conflicting* step (e.g. FAILED after READY) is an error.
 */
@Injectable()
export class AssetProcessingService {
  constructor(
    private readonly assetVersionsRepository: AssetVersionsRepository,
    private readonly catalogService: CatalogService,
  ) {}

  async start(versionId: string): Promise<AssetVersion> {
    this.assertVersionId(versionId);
    await this.applyTransition(versionId, AssetVersionStatus.PROCESSING, () =>
      this.assetVersionsRepository.markProcessing(versionId, Date.now()),
    );

    return this.catalogService.getAssetVersion(versionId);
  }

  async complete(versionId: string, outcome: ProcessingOutcome): Promise<AssetVersion> {
    this.assertVersionId(versionId);
    const validated = this.validateOutcome(outcome);
    const target =
      validated.kind === 'succeeded' ? AssetVersionStatus.READY : AssetVersionStatus.FAILED;

    await this.applyTransition(versionId, target, () =>
      validated.kind === 'succeeded'
        ? this.assetVersionsRepository.markReady(versionId, validated.outputs, Date.now())
        : this.assetVersionsRepository.markFailed(versionId, validated.reason, Date.now()),
    );

    return this.catalogService.getAssetVersion(versionId);
  }

  /** A malformed id can't name a version; rejecting it here keeps it away from the uuid column. */
  private assertVersionId(versionId: string): void {
    if (!isUuid(versionId)) {
      throw new InvalidAssetVersionIdException(`Asset version id ${versionId} is not a UUID`);
    }
  }

  /**
   * Runs a conditional transition and interprets "nothing updated": if the version is
   * already in the target status, a previous (retried) call did the work — success;
   * any other status means the step is out of order — conflict.
   */
  private async applyTransition(
    versionId: string,
    target: AssetVersionStatus,
    transition: () => Promise<boolean>,
  ): Promise<void> {
    if (await transition()) {
      return;
    }

    const current = await this.assetVersionsRepository.findUploadById(versionId);

    if (!current) {
      throw new AssetVersionNotFoundException(`Asset version ${versionId} not found`);
    }

    if (current.status !== target) {
      throw new ProcessingStateConflictException(
        `Version ${versionId} is ${current.status}; cannot move it to ${target}`,
      );
    }
  }

  private validateOutcome(outcome: ProcessingOutcome): ProcessingOutcome {
    if (outcome.kind === 'failed') {
      const reason = outcome.reason.trim().slice(0, MAX_FAILURE_REASON_LENGTH);

      if (reason.length === 0) {
        throw new InvalidProcessingResultException('A failed outcome needs a reason');
      }

      return {
        kind: 'failed',
        reason,
      };
    }

    const { optimized, thumbnails } = outcome.outputs;

    if (optimized.key.length === 0 || optimized.sizeBytes <= 0) {
      throw new InvalidProcessingResultException('A successful outcome needs the optimized file');
    }

    if (thumbnails.some((thumbnail) => thumbnail.object.key.length === 0)) {
      throw new InvalidProcessingResultException('Every thumbnail needs an object key');
    }

    return outcome;
  }
}
