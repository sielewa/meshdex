/** Scope guard: only binary glTF is accepted (CLAUDE.md). */
export const GLB_CONTENT_TYPE = 'model/gltf-binary';
export const GLB_EXTENSION = '.glb';

export const MAX_TITLE_LENGTH = 200;
export const MAX_TAGS_PER_ASSET = 20;
export const MAX_TAG_LENGTH = 50;

/** S3 limit: at most 10 000 parts per multipart upload. */
export const MAX_UPLOAD_PARTS = 10_000;

export const ASSET_EVENTS_TOPIC = 'asset.events.v1';
export const ASSET_UPLOADED_EVENT = 'asset.uploaded';
