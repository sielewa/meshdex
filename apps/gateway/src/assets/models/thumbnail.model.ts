import { Field, Int, ObjectType } from '@nestjs/graphql';
import { StoredFileModel } from './stored-file.model';

@ObjectType('Thumbnail')
export class ThumbnailModel {
  /** Named `object` in the domain (as in proto); `file` reads better in the API. */
  @Field(() => StoredFileModel, { name: 'file' })
  object!: StoredFileModel;

  @Field(() => Int)
  width!: number;

  @Field(() => Int)
  height!: number;

  @Field({ description: 'Camera preset of the render, e.g. "front", "three-quarter".' })
  view!: string;
}
