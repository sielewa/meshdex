import type { CatalogService } from '../catalog/catalog.service';
import type { AssetVersion } from './domain/asset-version.interface';
import { AssetVersionStatus } from './domain/asset-version-status.enum';
import type { ProcessingOutcome } from './domain/processing-outcome.type';
import type { ProcessingOutputs } from './domain/processing-outputs.interface';
import { AssetVersionNotFoundException } from './exceptions/asset-version-not-found.exception';
import { InvalidAssetVersionIdException } from './exceptions/invalid-asset-version-id.exception';
import { InvalidProcessingResultException } from './exceptions/invalid-processing-result.exception';
import { ProcessingStateConflictException } from './exceptions/processing-state-conflict.exception';
import type { AssetVersionsRepository } from './infrastructure/asset-versions.repository';
import { AssetProcessingService } from './asset-processing.service';

const VERSION_ID = '019a7a5e-8b1c-7c3d-9e4f-0000000000b1';

const outputs: ProcessingOutputs = {
  optimized: {
    key: 'optimized/a/v.glb',
    sizeBytes: 1000,
    contentType: 'model/gltf-binary',
  },
  thumbnails: [
    {
      object: {
        key: 'thumbnails/a/v/front.webp',
        sizeBytes: 10,
        contentType: 'image/webp',
      },
      width: 512,
      height: 512,
      view: 'front',
    },
  ],
  stats: {
    triangleCount: 10,
    vertexCount: 30,
    meshCount: 1,
    textureCount: 0,
  },
};
const succeeded: ProcessingOutcome = {
  kind: 'succeeded',
  outputs,
};

describe('AssetProcessingService', () => {
  let versions: {
    markProcessing: jest.Mock;
    markReady: jest.Mock;
    markFailed: jest.Mock;
    findUploadById: jest.Mock;
  };
  let catalog: { getAssetVersion: jest.Mock };
  let service: AssetProcessingService;
  const view = { id: VERSION_ID } as AssetVersion;
  const inStatus = (status: AssetVersionStatus): void => {
    versions.findUploadById.mockResolvedValue({
      versionId: VERSION_ID,
      status,
    });
  };

  beforeEach(() => {
    versions = {
      markProcessing: jest.fn().mockResolvedValue(true),
      markReady: jest.fn().mockResolvedValue(true),
      markFailed: jest.fn().mockResolvedValue(true),
      findUploadById: jest.fn(),
    };
    catalog = { getAssetVersion: jest.fn().mockResolvedValue(view) };
    service = new AssetProcessingService(
      versions as unknown as AssetVersionsRepository,
      catalog as unknown as CatalogService,
    );
  });

  it('rejects a malformed version id before touching the database', async () => {
    await expect(service.start('42')).rejects.toThrow(InvalidAssetVersionIdException);
    await expect(service.complete('42', succeeded)).rejects.toThrow(InvalidAssetVersionIdException);
    expect(versions.markProcessing).not.toHaveBeenCalled();
    expect(versions.markReady).not.toHaveBeenCalled();
  });

  it('starts processing an uploaded version', async () => {
    await expect(service.start(VERSION_ID)).resolves.toBe(view);
    expect(versions.markProcessing).toHaveBeenCalledWith(VERSION_ID, expect.any(Number));
  });

  it('treats a repeated start as success (at-least-once delivery)', async () => {
    versions.markProcessing.mockResolvedValue(false);
    inStatus(AssetVersionStatus.PROCESSING);

    await expect(service.start(VERSION_ID)).resolves.toBe(view);
  });

  it('refuses to start a version that is still uploading', async () => {
    versions.markProcessing.mockResolvedValue(false);
    inStatus(AssetVersionStatus.UPLOADING);

    await expect(service.start(VERSION_ID)).rejects.toThrow(ProcessingStateConflictException);
  });

  it('reports NotFound for an unknown version', async () => {
    versions.markProcessing.mockResolvedValue(false);
    versions.findUploadById.mockResolvedValue(null);

    await expect(service.start(VERSION_ID)).rejects.toThrow(AssetVersionNotFoundException);
  });

  it('records a successful result', async () => {
    await service.complete(VERSION_ID, succeeded);

    expect(versions.markReady).toHaveBeenCalledWith(VERSION_ID, outputs, expect.any(Number));
  });

  it('accepts the same outcome twice but rejects a conflicting one', async () => {
    versions.markReady.mockResolvedValue(false);
    versions.markFailed.mockResolvedValue(false);
    inStatus(AssetVersionStatus.READY);

    await expect(service.complete(VERSION_ID, succeeded)).resolves.toBe(view);
    await expect(
      service.complete(VERSION_ID, {
        kind: 'failed',
        reason: 'boom',
      }),
    ).rejects.toThrow(ProcessingStateConflictException);
  });

  it('requires a reason for failures and an optimized file for successes', async () => {
    await expect(
      service.complete(VERSION_ID, {
        kind: 'failed',
        reason: '  ',
      }),
    ).rejects.toThrow(InvalidProcessingResultException);
    await expect(
      service.complete(VERSION_ID, {
        kind: 'succeeded',
        outputs: {
          ...outputs,
          optimized: {
            key: '',
            sizeBytes: 0,
            contentType: '',
          },
        },
      }),
    ).rejects.toThrow(InvalidProcessingResultException);
  });
});
