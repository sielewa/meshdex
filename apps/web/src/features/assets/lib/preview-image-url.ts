import type { PreviewImageFragment } from '@/graphql/gql/graphql';

/** A rendered thumbnail once there is one, else the image uploaded with the model (ADR 017). */
export function previewImageUrl(version: PreviewImageFragment): string | null {
  const thumbnail = version.thumbnails.find((candidate) => candidate.file.url !== null);

  return thumbnail?.file.url ?? version.sourcePreview?.url ?? null;
}
