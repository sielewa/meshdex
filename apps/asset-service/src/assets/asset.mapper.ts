import {
  AssetVersionStatus as ProtoAssetVersionStatus,
  type Asset as ProtoAsset,
  type AssetVersion as ProtoAssetVersion,
  type StoredObject as ProtoStoredObject,
} from '@meshdex/proto/asset/v1';
import { toProtoTimestamp } from '@meshdex/shared';
import type { Asset, AssetVersion, StoredObject } from './domain/asset.interface';
import { AssetVersionStatus } from './domain/asset-version-status.enum';

/**
 * Generated proto types stop here (conventions): the domain uses string statuses and
 * epoch milliseconds, the contract uses numeric enums and google.protobuf.Timestamp.
 */

const STATUS_TO_PROTO: Record<AssetVersionStatus, ProtoAssetVersionStatus> = {
  [AssetVersionStatus.UPLOADING]: ProtoAssetVersionStatus.ASSET_VERSION_STATUS_UPLOADING,
  [AssetVersionStatus.UPLOADED]: ProtoAssetVersionStatus.ASSET_VERSION_STATUS_UPLOADED,
  [AssetVersionStatus.PROCESSING]: ProtoAssetVersionStatus.ASSET_VERSION_STATUS_PROCESSING,
  [AssetVersionStatus.READY]: ProtoAssetVersionStatus.ASSET_VERSION_STATUS_READY,
  [AssetVersionStatus.FAILED]: ProtoAssetVersionStatus.ASSET_VERSION_STATUS_FAILED,
};

export function toProtoStatus(status: AssetVersionStatus): ProtoAssetVersionStatus {
  return STATUS_TO_PROTO[status];
}

function toProtoStoredObject(object: StoredObject): ProtoStoredObject {
  return { key: object.key, sizeBytes: object.sizeBytes, contentType: object.contentType };
}

export function toProtoAssetVersion(version: AssetVersion): ProtoAssetVersion {
  return {
    id: version.id,
    assetId: version.assetId,
    number: version.number,
    status: toProtoStatus(version.status),
    original: toProtoStoredObject(version.original),
    optimized: version.optimized ? toProtoStoredObject(version.optimized) : undefined,
    thumbnails: version.thumbnails.map((thumbnail) => ({
      object: toProtoStoredObject(thumbnail.object),
      width: thumbnail.width,
      height: thumbnail.height,
      view: thumbnail.view,
    })),
    stats: version.stats ?? undefined,
    failureReason: version.failureReason ?? '',
    createdAt: toProtoTimestamp(version.createdAt),
    processedAt: version.processedAt === null ? undefined : toProtoTimestamp(version.processedAt),
  };
}

export function toProtoAsset(asset: Asset): ProtoAsset {
  return {
    id: asset.id,
    title: asset.title,
    tags: asset.tags,
    currentVersion: toProtoAssetVersion(asset.currentVersion),
    createdAt: toProtoTimestamp(asset.createdAt),
    updatedAt: toProtoTimestamp(asset.updatedAt),
  };
}
