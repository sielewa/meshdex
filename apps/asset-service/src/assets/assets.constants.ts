/** Scope guard: only binary glTF is accepted (CLAUDE.md). */
export const GLB_CONTENT_TYPE = 'model/gltf-binary';
export const GLB_EXTENSION = '.glb';

export const MAX_TITLE_LENGTH = 200;
export const MAX_TAGS_PER_ASSET = 20;
export const MAX_TAG_LENGTH = 50;

/** No SVG: it can carry scripts, and previews are served publicly from our origin (ADR 017). */
export const SOURCE_PREVIEW_EXTENSIONS: Readonly<Record<string, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};
/** A preview is a picture for a card and for CLIP, not a texture. */
export const MAX_SOURCE_PREVIEW_SIZE_BYTES = 2_000_000;

/** S3 limit: at most 10 000 parts per multipart upload. */
export const MAX_UPLOAD_PARTS = 10_000;

export const ASSET_EVENTS_TOPIC = 'asset.events.v1';
export const ASSET_UPLOADED_EVENT = 'asset.uploaded';

export const MAX_FAILURE_REASON_LENGTH = 1000;
