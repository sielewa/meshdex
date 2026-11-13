import { ArgsType, Field, Int } from '@nestjs/graphql';
import { IsInt, IsString, Max, MaxLength, Min } from 'class-validator';
import {
  MAX_SEARCH_LIMIT,
  MAX_SEARCH_QUERY_LENGTH,
} from '../../clients/ml-service/ml-service.constants';
import { DEFAULT_SEARCH_SIZE } from '../search.constants';

/**
 * Shape and cost bounds only (ADR 009): the length cap keeps an oversized query from reaching
 * ml-service at all; what counts as a usable query (e.g. not blank) is ml-service's rule and
 * comes back as BAD_USER_INPUT.
 */
@ArgsType()
export class SearchAssetsArgs {
  @Field({ description: 'e.g. "rusty industrial barrel"; 1–500 characters.' })
  @IsString()
  @MaxLength(MAX_SEARCH_QUERY_LENGTH)
  query!: string;

  @Field(() => Int, { defaultValue: DEFAULT_SEARCH_SIZE, description: '1–100.' })
  @IsInt()
  @Min(1)
  @Max(MAX_SEARCH_LIMIT)
  first!: number;
}
