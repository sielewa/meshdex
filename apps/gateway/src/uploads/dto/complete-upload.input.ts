import { Field, ID, InputType } from '@nestjs/graphql';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsUUID, ValidateNested } from 'class-validator';
import { MAX_UPLOAD_PARTS } from '../uploads.constants';
import { CompletedPartInput } from './completed-part.input';

@InputType()
export class CompleteUploadInput {
  @Field(() => ID)
  @IsUUID()
  assetVersionId!: string;

  /** `@Type` makes class-transformer build `CompletedPartInput`s, so their rules run too. */
  @Field(() => [CompletedPartInput], { description: 'One entry per uploaded part, any order.' })
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_UPLOAD_PARTS)
  @ValidateNested({ each: true })
  @Type(() => CompletedPartInput)
  parts!: CompletedPartInput[];
}
