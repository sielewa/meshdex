import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsString, IsUrl, Max, Min } from 'class-validator';

/**
 * Every environment variable ingest reads, validated once at startup (ADR 007).
 * Modules never touch `process.env`; they inject their config namespace instead.
 */
export class IngestEnv {
  /** Base URL of the Poly Haven public API (ADR 013). */
  @IsUrl({
    protocols: ['https', 'http'],
    require_tld: false,
    require_protocol: true,
  })
  POLYHAVEN_API_URL!: string;

  /** Model cache written by `fetch` and read by `import`; relative to the working directory. */
  @IsString()
  @IsNotEmpty()
  INGEST_CACHE_DIR!: string;

  /** host:port of asset-service's gRPC server; `import` creates assets there. */
  @IsString()
  @IsNotEmpty()
  ASSET_SERVICE_URL!: string;

  /** Deadline for read RPCs (GetUploadPartUrls). */
  @Type(() => Number)
  @IsInt()
  @Min(50)
  @Max(60_000)
  ASSET_SERVICE_READ_TIMEOUT_MS!: number;

  /** Deadline for RPCs that change state and talk to object storage (Initiate/Complete/AbortUpload). */
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
