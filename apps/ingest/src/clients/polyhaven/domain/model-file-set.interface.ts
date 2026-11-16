import type { RemoteFile } from './remote-file.interface';

export interface ModelFileSet {
  /** Path of the `.gltf` file among `files`. */
  gltfPath: string;
  files: RemoteFile[];
}
