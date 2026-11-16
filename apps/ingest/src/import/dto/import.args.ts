import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { SAFE_MODEL_ID } from '../../cache/cache.constants';
import type { TextureResolution } from '../../clients/polyhaven/domain/texture-resolution.type';
import { RUN_LABEL_PATTERN } from '../../runs/runs.constants';
import {
  IMPORT_MAX_PACK_CONCURRENCY,
  IMPORT_MAX_QUEUE_SIZE,
  IMPORT_MAX_UPLOAD_CONCURRENCY,
} from '../import.constants';

export class ImportArgs {
  @IsIn(['1k', '2k', '4k'])
  resolution!: TextureResolution;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(IMPORT_MAX_PACK_CONCURRENCY)
  packConcurrency!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(IMPORT_MAX_UPLOAD_CONCURRENCY)
  uploadConcurrency!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(IMPORT_MAX_QUEUE_SIZE)
  queueSize!: number;

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

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  state?: string;

  @IsOptional()
  @IsBoolean()
  packInWorkers?: boolean;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  record?: string;

  @IsOptional()
  @Matches(RUN_LABEL_PATTERN, {
    message: 'label must be lower-case letters, digits and dashes (max 63)',
  })
  label?: string;
}
