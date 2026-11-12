/** Written last in a model's folder: its presence means every file is complete and verified. */
export const MANIFEST_FILE_NAME = 'model.json';

/** A file being written; renamed to its final name only after its size and MD5 match. */
export const PARTIAL_FILE_SUFFIX = '.part';

/** Model ids become folder names, so only plain slugs are accepted (no `/`, no leading `.`). */
export const SAFE_MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/;
