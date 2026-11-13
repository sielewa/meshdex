import type { PreviewImageFragment } from '@/graphql/gql/graphql';

/**
 * The image to show for a version (ADR 017): a thumbnail rendered by the processing worker
 * once there is one, otherwise the image supplied with the upload (e.g. Poly Haven's render),
 * otherwise none and the caller shows a placeholder. Only public files have a URL.
 */
export function previewImageUrl(version: PreviewImageFragment): string | null {
  const thumbnail = version.thumbnails.find((candidate) => candidate.file.url !== null);

  return thumbnail?.file.url ?? version.sourcePreview?.url ?? null;
}
