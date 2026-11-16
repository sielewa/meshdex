import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsString, IsUrl, Max, Min } from 'class-validator';

/** Validated once at startup (ADR 007). */
export class IngestEnv {
  @IsUrl({
    protocols: ['https', 'http'],
    require_tld: false,
    require_protocol: true,
  })
  POLYHAVEN_API_URL!: string;

  /** Relative to the working directory. */
  @IsString()
  @IsNotEmpty()
  INGEST_CACHE_DIR!: string;

  @IsString()
  @IsNotEmpty()
  ASSET_SERVICE_URL!: string;

  @Type(() => Number)
  @IsInt()
  @Min(50)
  @Max(60_000)
  ASSET_SERVICE_READ_TIMEOUT_MS!: number;

  @Type(() => Number)
  @IsInt()
  @Min(50)
  @Max(120_000)
  ASSET_SERVICE_WRITE_TIMEOUT_MS!: number;

  @IsIn(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
  LOG_LEVEL!: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  LOG_PRETTY!: boolean;
}
