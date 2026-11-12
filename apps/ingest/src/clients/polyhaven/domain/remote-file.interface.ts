/** One file of a model as listed by the API. */
export interface RemoteFile {
  /** Path relative to the model's folder, as the `.gltf` refers to it (e.g. `textures/x_diff_1k.jpg`). */
  path: string;
  url: string;
  sizeBytes: number;
  md5: string;
}
