import type { AssetVersionStatus } from './asset-version-status.enum';

/** Times are epoch milliseconds inside the service (ADR 003). */

export interface StoredObject {
  key: string;
  sizeBytes: number;
  contentType: string;
}

export interface Thumbnail {
  object: StoredObject;
  width: number;
  height: number;
  view: string;
}

export interface ModelStats {
  triangleCount: number;
  vertexCount: number;
  meshCount: number;
  textureCount: number;
}

export interface AssetVersion {
  id: string;
  assetId: string;
  number: number;
  status: AssetVersionStatus;
  original: StoredObject;
  optimized: StoredObject | null;
  thumbnails: Thumbnail[];
  stats: ModelStats | null;
  failureReason: string | null;
  createdAt: number;
  processedAt: number | null;
}

export interface Asset {
  id: string;
  title: string;
  tags: string[];
  currentVersion: AssetVersion;
  createdAt: number;
  updatedAt: number;
}
