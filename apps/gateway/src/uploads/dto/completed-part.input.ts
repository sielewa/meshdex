import { Field, InputType, Int } from '@nestjs/graphql';
import { IsInt, IsString, Max, Min } from 'class-validator';
import { MAX_UPLOAD_PARTS } from '../uploads.constants';

@InputType()
export class CompletedPartInput {
  @Field(() => Int)
  @IsInt()
  @Min(1)
  @Max(MAX_UPLOAD_PARTS)
  partNumber!: number;

  @Field({ description: 'ETag response header of the part upload.' })
  @IsString()
  etag!: string;
}
