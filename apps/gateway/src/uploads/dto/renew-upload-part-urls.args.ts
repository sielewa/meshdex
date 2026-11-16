import { ArgsType, Field, ID, Int } from '@nestjs/graphql';
import { ArrayMaxSize, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { MAX_UPLOAD_PARTS } from '../uploads.constants';

@ArgsType()
export class RenewUploadPartUrlsArgs {
  @Field(() => ID)
  @IsUUID()
  assetVersionId!: string;

  @Field(() => [Int], { nullable: true, description: 'Parts to re-sign; null or empty means all.' })
  @IsOptional()
  @ArrayMaxSize(MAX_UPLOAD_PARTS)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(MAX_UPLOAD_PARTS, { each: true })
  partNumbers?: number[] | null;
}
