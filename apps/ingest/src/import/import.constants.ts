/** Upper bounds of the CLI options; the defaults live in main.ts. */
export const IMPORT_MAX_PACK_CONCURRENCY = 8;
export const IMPORT_MAX_UPLOAD_CONCURRENCY = 16;
export const IMPORT_MAX_QUEUE_SIZE = 32;

export const IMPORT_STATE_FILE_NAME = 'import-state.jsonl';

/** The web asset page shows the Poly Haven credit for it (ADR 013). */
export const SOURCE_TAG = 'polyhaven';

/** Poly Haven lists asset packs as categories like `collection: the_shed`; the tag keeps the name. */
export const COLLECTION_CATEGORY_PREFIX = /^collection:\s*/i;

export const GLB_EXTENSION = '.glb';

/** Copied from asset-service, so metadata is fitted to them instead of the model being rejected. */
export const MAX_TITLE_LENGTH = 200;
export const MAX_TAGS_PER_ASSET = 20;
export const MAX_TAG_LENGTH = 50;
