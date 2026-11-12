import type { RemoteFile } from './remote-file.interface';

/** The `.gltf` file of a model at one resolution and every file it references. */
export interface ModelFileSet {
  /** Path of the `.gltf` file among `files`. */
  gltfPath: string;
  files: RemoteFile[];
}
