import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
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

/** Options of `ingest import`, validated before the command runs. */
export class ImportArgs {
  @IsIn(['1k', '2k', '4k'])
  resolution!: TextureResolution;

  /** Models packed at the same time (pack stage workers). */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(IMPORT_MAX_PACK_CONCURRENCY)
  packConcurrency!: number;

  /** Models uploaded at the same time (upload stage workers; parts of one model go one by one). */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(IMPORT_MAX_UPLOAD_CONCURRENCY)
  uploadConcurrency!: number;

  /** Packed models waiting for an upload worker; the pack stage pauses when it is full. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(IMPORT_MAX_QUEUE_SIZE)
  queueSize!: number;

  /** First N cached models by id; all when omitted. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  /** Only these model ids. */
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @Matches(SAFE_MODEL_ID, { each: true })
  ids?: string[];

  /** State file path; `<cache dir>/import-state.jsonl` when omitted. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  state?: string;

  /** Directory to write the run's measurements to as JSON; nothing is written when omitted. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  record?: string;

  /** Short name of the run (`baseline`, `queue-16`), part of the record's file name. */
  @IsOptional()
  @Matches(RUN_LABEL_PATTERN, {
    message: 'label must be lower-case letters, digits and dashes (max 63)',
  })
  label?: string;
}
