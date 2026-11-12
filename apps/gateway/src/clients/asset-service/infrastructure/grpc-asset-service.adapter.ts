import { status, type ServiceError } from '@grpc/grpc-js';
import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { lastValueFrom, type Observable } from 'rxjs';
import {
  ASSET_SERVICE_NAME,
  AssetVersionStatus as ProtoAssetVersionStatus,
  type Asset as ProtoAsset,
  type AssetServiceClient,
  type AssetVersion as ProtoAssetVersion,
  type StoredObject as ProtoStoredObject,
  type UploadPartUrl as ProtoUploadPartUrl,
} from '@meshdex/proto/asset/v1';
import { fromProtoTimestamp, type ProtoTimestamp } from '@meshdex/shared';
import { ASSET_SERVICE_GRPC_CLIENT } from '../asset-service.tokens';
import type { Asset } from '../domain/asset.interface';
import type { AssetPage } from '../domain/asset-page.interface';
import type { AssetServicePort } from '../domain/asset-service-port.interface';
import { AssetStatus } from '../domain/asset-status.enum';
import type { AssetVersion } from '../domain/asset-version.interface';
import type { CompletedPart } from '../domain/completed-part.interface';
import type { InitiateUploadCommand } from '../domain/initiate-upload-command.interface';
import type { ListAssetsQuery } from '../domain/list-assets-query.interface';
import type { OriginalDownloadUrl } from '../domain/original-download-url.interface';
import type { StoredObject } from '../domain/stored-object.interface';
import type { UploadPartUrl } from '../domain/upload-part-url.interface';
import type { UploadSession } from '../domain/upload-session.interface';
import { AssetServiceUnavailableException } from '../exceptions/asset-service-unavailable.exception';
import { AssetStateConflictException } from '../exceptions/asset-state-conflict.exception';
import { InvalidAssetRequestException } from '../exceptions/invalid-asset-request.exception';
import { ResourceNotFoundException } from '../exceptions/resource-not-found.exception';

/**
 * `AssetServicePort` over gRPC. Generated proto types stop here: responses are mapped to
 * domain interfaces (string statuses, epoch milliseconds, `null` for empty fields) and gRPC
 * status codes to domain exceptions. Deadlines and retries come from the channel's service
 * config (`AssetServiceClientOptionsFactory`), so every call here has one.
 */
@Injectable()
export class GrpcAssetServiceAdapter implements AssetServicePort, OnModuleInit {
  private client!: AssetServiceClient;

  constructor(@Inject(ASSET_SERVICE_GRPC_CLIENT) private readonly grpc: ClientGrpc) {}

  /** The proto is loaded when the module initialises; the TCP connection opens on the first call. */
  onModuleInit(): void {
    this.client = this.grpc.getService<AssetServiceClient>(ASSET_SERVICE_NAME);
  }

  async batchGetAssets(assetIds: readonly string[]): Promise<Asset[]> {
    const response = await this.call(this.client.batchGetAssets({ assetIds: [...assetIds] }));

    return response.assets.map((asset) => this.toAsset(asset));
  }

  async listAssets(query: ListAssetsQuery): Promise<AssetPage> {
    const response = await this.call(
      this.client.listAssets({
        pageSize: query.pageSize,
        pageToken: query.pageToken ?? '',
        statuses: query.statuses.map((assetStatus) => this.toProtoStatus(assetStatus)),
        tag: query.tag ?? '',
      }),
    );

    return {
      assets: response.assets.map((asset) => this.toAsset(asset)),
      nextPageToken: response.nextPageToken === '' ? null : response.nextPageToken,
    };
  }

  async initiateUpload(command: InitiateUploadCommand): Promise<UploadSession> {
    const response = await this.call(this.client.initiateUpload(command));

    return {
      assetId: response.assetId,
      assetVersionId: response.assetVersionId,
      partSizeBytes: response.partSizeBytes,
      parts: response.parts.map((part) => this.toUploadPartUrl(part)),
    };
  }

  async getUploadPartUrls(assetVersionId: string, partNumbers: number[]): Promise<UploadPartUrl[]> {
    const response = await this.call(
      this.client.getUploadPartUrls({
        assetVersionId,
        partNumbers,
      }),
    );

    return response.parts.map((part) => this.toUploadPartUrl(part));
  }

  async completeUpload(assetVersionId: string, parts: CompletedPart[]): Promise<Asset> {
    const response = await this.call(
      this.client.completeUpload({
        assetVersionId,
        parts,
      }),
    );

    return this.toAsset(this.required(response.asset, 'CompleteUploadResponse.asset'));
  }

  async abortUpload(assetVersionId: string): Promise<void> {
    await this.call(this.client.abortUpload({ assetVersionId }));
  }

  async getOriginalDownloadUrls(versionIds: readonly string[]): Promise<OriginalDownloadUrl[]> {
    const response = await this.call(
      this.client.getOriginalDownloadUrls({ assetVersionIds: [...versionIds] }),
    );

    return response.urls.map((download) => ({
      versionId: download.assetVersionId,
      url: download.url,
      expiresAt: this.toEpochMs(
        download.expiresAt,
        `OriginalDownloadUrl ${download.assetVersionId} expiresAt`,
      ),
    }));
  }

  /**
   * NestJS returns a cold Observable: the RPC starts on subscription (`lastValueFrom`), and
   * unsubscribing cancels it. Every call goes through here so error mapping can't be skipped.
   */
  private async call<T>(response$: Observable<T>): Promise<T> {
    try {
      return await lastValueFrom(response$);
    } catch (error) {
      throw this.toDomainException(error);
    }
  }

  /**
   * gRPC status → domain exception. asset-service writes client-safe messages for the
   * codes it returns on purpose, so `details` is passed on; for transport failures it is
   * not (it may name hosts and ports). Other codes (INTERNAL, UNKNOWN…) are bugs, not
   * client errors: they are rethrown unchanged and masked by the GraphQL error formatter.
   */
  private toDomainException(error: unknown): unknown {
    if (!this.isServiceError(error)) {
      return error;
    }

    const { details } = error;

    switch (error.code) {
      case status.INVALID_ARGUMENT:
        return new InvalidAssetRequestException(details);
      case status.NOT_FOUND:
        return new ResourceNotFoundException(details);
      case status.FAILED_PRECONDITION:
      case status.ALREADY_EXISTS:
        return new AssetStateConflictException(details);
      case status.UNAVAILABLE:
      case status.DEADLINE_EXCEEDED:
        return new AssetServiceUnavailableException('asset-service is unavailable', {
          cause: error,
        });
      default:
        return error;
    }
  }

  /** Errors from a gRPC call carry the status `code` and the server's `details` message. */
  private isServiceError(error: unknown): error is ServiceError {
    return (
      error instanceof Error &&
      'code' in error &&
      typeof error.code === 'number' &&
      'details' in error &&
      typeof error.details === 'string'
    );
  }

  private toAsset(asset: ProtoAsset): Asset {
    const currentVersion = this.toAssetVersion(
      this.required(asset.currentVersion, `Asset ${asset.id} currentVersion`),
    );

    return {
      id: asset.id,
      title: asset.title,
      tags: asset.tags,
      status: currentVersion.status,
      currentVersion,
      createdAt: this.toEpochMs(asset.createdAt, `Asset ${asset.id} createdAt`),
      updatedAt: this.toEpochMs(asset.updatedAt, `Asset ${asset.id} updatedAt`),
    };
  }

  private toAssetVersion(version: ProtoAssetVersion): AssetVersion {
    const context = `AssetVersion ${version.id}`;

    return {
      id: version.id,
      assetId: version.assetId,
      number: version.number,
      status: this.fromProtoStatus(version.status),
      original: this.toStoredObject(this.required(version.original, `${context} original`)),
      optimized: version.optimized ? this.toStoredObject(version.optimized) : null,
      thumbnails: version.thumbnails.map((thumbnail) => ({
        object: this.toStoredObject(this.required(thumbnail.object, `${context} thumbnail`)),
        width: thumbnail.width,
        height: thumbnail.height,
        view: thumbnail.view,
      })),
      stats: version.stats ?? null,
      // proto3 strings can't be absent: "" means "not set".
      failureReason: version.failureReason === '' ? null : version.failureReason,
      createdAt: this.toEpochMs(version.createdAt, `${context} createdAt`),
      processedAt: version.processedAt ? fromProtoTimestamp(version.processedAt) : null,
    };
  }

  private toStoredObject(object: ProtoStoredObject): StoredObject {
    return {
      key: object.key,
      sizeBytes: object.sizeBytes,
      contentType: object.contentType,
    };
  }

  private toUploadPartUrl(part: ProtoUploadPartUrl): UploadPartUrl {
    return {
      partNumber: part.partNumber,
      url: part.url,
      expiresAt: this.toEpochMs(part.expiresAt, `UploadPartUrl ${part.partNumber} expiresAt`),
    };
  }

  private toEpochMs(timestamp: ProtoTimestamp | undefined, field: string): number {
    return fromProtoTimestamp(this.required(timestamp, field));
  }

  /**
   * Message fields are optional in proto3, but asset-service always sets these. A missing
   * one means a broken contract, which must fail loudly rather than become a fake default.
   */
  private required<T>(value: T | undefined, field: string): T {
    if (value === undefined) {
      throw new Error(`asset-service response is missing ${field}`);
    }

    return value;
  }

  /** UNSPECIFIED or a value from a newer contract: not something the gateway can show. */
  private fromProtoStatus(protoStatus: ProtoAssetVersionStatus): AssetStatus {
    switch (protoStatus) {
      case ProtoAssetVersionStatus.ASSET_VERSION_STATUS_UPLOADING:
        return AssetStatus.UPLOADING;
      case ProtoAssetVersionStatus.ASSET_VERSION_STATUS_UPLOADED:
        return AssetStatus.UPLOADED;
      case ProtoAssetVersionStatus.ASSET_VERSION_STATUS_PROCESSING:
        return AssetStatus.PROCESSING;
      case ProtoAssetVersionStatus.ASSET_VERSION_STATUS_READY:
        return AssetStatus.READY;
      case ProtoAssetVersionStatus.ASSET_VERSION_STATUS_FAILED:
        return AssetStatus.FAILED;
      default:
        throw new Error(`asset-service returned unknown asset status ${String(protoStatus)}`);
    }
  }

  private toProtoStatus(assetStatus: AssetStatus): ProtoAssetVersionStatus {
    switch (assetStatus) {
      case AssetStatus.UPLOADING:
        return ProtoAssetVersionStatus.ASSET_VERSION_STATUS_UPLOADING;
      case AssetStatus.UPLOADED:
        return ProtoAssetVersionStatus.ASSET_VERSION_STATUS_UPLOADED;
      case AssetStatus.PROCESSING:
        return ProtoAssetVersionStatus.ASSET_VERSION_STATUS_PROCESSING;
      case AssetStatus.READY:
        return ProtoAssetVersionStatus.ASSET_VERSION_STATUS_READY;
      case AssetStatus.FAILED:
        return ProtoAssetVersionStatus.ASSET_VERSION_STATUS_FAILED;
    }
  }
}
