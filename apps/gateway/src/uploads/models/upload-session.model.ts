import { Field, Float, ID, ObjectType } from '@nestjs/graphql';
import { UploadPartUrlModel } from './upload-part-url.model';

@ObjectType('UploadSession')
export class UploadSessionModel {
  @Field(() => ID)
  assetId!: string;

  @Field(() => ID)
  assetVersionId!: string;

  @Field(() => Float, { description: 'Every part except the last has exactly this size (bytes).' })
  partSizeBytes!: number;

  @Field(() => [UploadPartUrlModel])
  parts!: UploadPartUrlModel[];
}
