import type { StoredObject } from './stored-object.interface';

export interface Thumbnail {
  object: StoredObject;
  width: number;
  height: number;
  view: string;
}
