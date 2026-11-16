import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { SAFE_MODEL_ID } from '../../cache/cache.constants';
import type { TextureResolution } from '../../clients/polyhaven/domain/texture-resolution.type';
import { FETCH_MAX_CONCURRENCY } from '../fetch.constants';

export class FetchArgs {
  @IsIn(['1k', '2k', '4k'])
  resolution!: TextureResolution;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(FETCH_MAX_CONCURRENCY)
  concurrency!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @Matches(SAFE_MODEL_ID, { each: true })
  ids?: string[];
}
