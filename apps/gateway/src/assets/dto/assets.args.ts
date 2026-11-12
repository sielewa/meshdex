import { ArgsType, Field, Int } from '@nestjs/graphql';
import { ArrayMaxSize, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { AssetStatus } from '../../clients/asset-service/domain/asset-status.enum';
import '../models/asset-status.registration';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../assets.constants';

/** Shape and cost bounds only; business rules (e.g. what a valid tag is) stay in asset-service. */
@ArgsType()
export class AssetsArgs {
  @Field(() => Int, { defaultValue: DEFAULT_PAGE_SIZE })
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  first!: number;

  @Field(() => String, {
    nullable: true,
    description: '`pageInfo.endCursor` of the previous page.',
  })
  @IsOptional()
  @IsString()
  after?: string | null;

  @Field(() => [AssetStatus], { nullable: true, description: 'Empty or null means all.' })
  @IsOptional()
  @IsEnum(AssetStatus, { each: true })
  @ArrayMaxSize(Object.keys(AssetStatus).length)
  statuses?: AssetStatus[] | null;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  tag?: string | null;
}
