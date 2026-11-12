import { AssetVersionStatus, type Asset } from '@meshdex/proto/asset/v1';

/**
 * An asset as asset-service sends it: UPLOADED, no derivatives yet, created at
 * 2026-11-12T09:00:00.123Z. The original is above 2^32 bytes, so int64 handling is covered.
 */
export function protoAsset(id: string, title = 'Chair'): Asset {
  return {
    id,
    title,
    tags: ['furniture'],
    currentVersion: {
      id: `${id}-v1`,
      assetId: id,
      number: 1,
      status: AssetVersionStatus.ASSET_VERSION_STATUS_UPLOADED,
      original: {
        key: `assets/${id}/original.glb`,
        sizeBytes: 5_000_000_000,
        contentType: 'model/gltf-binary',
      },
      optimized: undefined,
      thumbnails: [],
      stats: undefined,
      failureReason: '',
      createdAt: {
        seconds: 1_794_474_000,
        nanos: 123_000_000,
      },
      processedAt: undefined,
    },
    createdAt: {
      seconds: 1_794_474_000,
      nanos: 123_000_000,
    },
    updatedAt: {
      seconds: 1_794_474_300,
      nanos: 0,
    },
  };
}
