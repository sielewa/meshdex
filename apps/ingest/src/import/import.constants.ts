/** Upper bounds of the CLI options; the defaults live in main.ts. */
export const IMPORT_MAX_PACK_CONCURRENCY = 8;
export const IMPORT_MAX_UPLOAD_CONCURRENCY = 16;
export const IMPORT_MAX_QUEUE_SIZE = 32;

/** Next to the model folders in the cache; `--state` points elsewhere (e.g. a fresh benchmark run). */
export const IMPORT_STATE_FILE_NAME = 'import-state.jsonl';

/** Every imported asset carries it; the web asset page shows the Poly Haven credit for it (ADR 013). */
export const SOURCE_TAG = 'polyhaven';

/** Poly Haven lists asset packs as categories like `collection: the_shed`; the tag keeps the name. */
export const COLLECTION_CATEGORY_PREFIX = /^collection:\s*/i;

/** Imported files are named `<model id>.glb`; asset-service requires the extension. */
export const GLB_EXTENSION = '.glb';

/**
 * asset-service's limits (asset-service `assets.constants.ts`). They are repeated so that
 * Poly Haven's metadata is fitted to them instead of the whole model being rejected.
 */
export const MAX_TITLE_LENGTH = 200;
export const MAX_TAGS_PER_ASSET = 20;
export const MAX_TAG_LENGTH = 50;
