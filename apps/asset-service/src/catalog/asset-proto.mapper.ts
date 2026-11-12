import { Injectable } from '@nestjs/common';
import {
  AssetVersionStatus as ProtoAssetVersionStatus,
  type Asset as ProtoAsset,
  type AssetVersion as ProtoAssetVersion,
  type StoredObject as ProtoStoredObject,
} from '@meshdex/proto/asset/v1';
import { toProtoTimestamp } from '@meshdex/shared';
import type { Asset } from '../assets/domain/asset.interface';
import type { AssetVersion } from '../assets/domain/asset-version.interface';
import { AssetVersionStatus } from '../assets/domain/asset-version-status.enum';
import type { StoredObject } from '../assets/domain/stored-object.interface';

/**
 * Domain -> contract mapping shared by every controller that returns assets. Generated
 * proto types stop here (conventions): the domain uses string statuses and epoch
 * milliseconds, the contract uses numeric enums and google.protobuf.Timestamp.
 * Lives in the catalog module (which `assets` imports) so no module cycle is needed.
 */
@Injectable()
export class AssetProtoMapper {
  toProtoAsset(asset: Asset): ProtoAsset {
    return {
      id: asset.id,
      title: asset.title,
      tags: asset.tags,
      currentVersion: this.toProtoAssetVersion(asset.currentVersion),
      createdAt: toProtoTimestamp(asset.createdAt),
      updatedAt: toProtoTimestamp(asset.updatedAt),
    };
  }

  toProtoAssetVersion(version: AssetVersion): ProtoAssetVersion {
    return {
      id: version.id,
      assetId: version.assetId,
      number: version.number,
      status: this.toProtoStatus(version.status),
      original: this.toProtoStoredObject(version.original),
      optimized: version.optimized ? this.toProtoStoredObject(version.optimized) : undefined,
      thumbnails: version.thumbnails.map((thumbnail) => ({
        object: this.toProtoStoredObject(thumbnail.object),
        width: thumbnail.width,
        height: thumbnail.height,
        view: thumbnail.view,
      })),
      stats: version.stats ?? undefined,
      failureReason: version.failureReason ?? '',
      createdAt: toProtoTimestamp(version.createdAt),
      processedAt: version.processedAt === null ? undefined : toProtoTimestamp(version.processedAt),
      sourcePreview: version.sourcePreview
        ? this.toProtoStoredObject(version.sourcePreview)
        : undefined,
    };
  }

  private toProtoStatus(status: AssetVersionStatus): ProtoAssetVersionStatus {
    switch (status) {
      case AssetVersionStatus.UPLOADING:
        return ProtoAssetVersionStatus.ASSET_VERSION_STATUS_UPLOADING;
      case AssetVersionStatus.UPLOADED:
        return ProtoAssetVersionStatus.ASSET_VERSION_STATUS_UPLOADED;
      case AssetVersionStatus.PROCESSING:
        return ProtoAssetVersionStatus.ASSET_VERSION_STATUS_PROCESSING;
      case AssetVersionStatus.READY:
        return ProtoAssetVersionStatus.ASSET_VERSION_STATUS_READY;
      case AssetVersionStatus.FAILED:
        return ProtoAssetVersionStatus.ASSET_VERSION_STATUS_FAILED;
    }
  }

  private toProtoStoredObject(object: StoredObject): ProtoStoredObject {
    return {
      key: object.key,
      sizeBytes: object.sizeBytes,
      contentType: object.contentType,
    };
  }
}
