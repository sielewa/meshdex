import type { InitiateUploadInput } from '@/graphql/gql/graphql';

export interface PartUrl {
  partNumber: number;
  url: string;
  /** ISO 8601. */
  expiresAt: string;
}

export interface UploadApi {
  initiate(input: InitiateUploadInput): Promise<{
    assetId: string;
    assetVersionId: string;
    partSizeBytes: number;
    parts: PartUrl[];
  }>;
  renewPartUrls(assetVersionId: string, partNumbers: number[]): Promise<PartUrl[]>;
  complete(assetVersionId: string, parts: { partNumber: number; etag: string }[]): Promise<void>;
  abort(assetVersionId: string): Promise<void>;
}
