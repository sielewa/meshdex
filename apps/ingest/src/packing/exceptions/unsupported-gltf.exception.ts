/**
 * The model can't be packed without losing or inventing content: an extension the packer
 * doesn't know (it would be silently dropped), or a resource that isn't among the model's
 * cached files.
 */
export class UnsupportedGltfException extends Error {}
