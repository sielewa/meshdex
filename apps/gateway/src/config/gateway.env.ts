import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsString, IsUrl, Max, Min } from 'class-validator';

/** Validated once at startup (ADR 007). */
export class GatewayEnv {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  HTTP_PORT!: number;

  /** Comma-separated. */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.split(',').map((origin) => origin.trim()) : value,
  )
  @IsUrl(
    {
      protocols: ['http', 'https'],
      require_tld: false,
      require_protocol: true,
    },
    { each: true },
  )
  CORS_ORIGINS!: string[];

  /** Off in public deployments. */
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  GRAPHQL_INTROSPECTION!: boolean;

  @IsString()
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

  @IsString()
  ML_SERVICE_URL!: string;

  /** One CLIP text embedding (~15 ms warm on a GPU) plus an HNSW query, retries included. */
  @Type(() => Number)
  @IsInt()
  @Min(50)
  @Max(60_000)
  ML_SERVICE_SEARCH_TIMEOUT_MS!: number;

  /** CloudFront in the cloud, the S3 emulator's bucket path locally (ADR 010). */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && !value.endsWith('/') ? `${value}/` : value,
  )
  @IsUrl({
    protocols: ['http', 'https'],
    require_tld: false,
    require_protocol: true,
  })
  MEDIA_BASE_URL!: string;

  @IsIn(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
  LOG_LEVEL!: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  LOG_PRETTY!: boolean;
}
