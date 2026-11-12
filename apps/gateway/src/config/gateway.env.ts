import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsString, IsUrl, Max, Min } from 'class-validator';

/**
 * Every environment variable the gateway reads, validated once at startup (ADR 007).
 * Modules never touch `process.env`; they inject their config namespace instead.
 * Booleans accept only the literal strings "true"/"false"; anything else fails `@IsBoolean`.
 */
export class GatewayEnv {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  HTTP_PORT!: number;

  /** Comma-separated browser origins allowed to call the API (the web app). */
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

  /** Schema introspection: on locally (tooling, codegen), off in public deployments. */
  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  GRAPHQL_INTROSPECTION!: boolean;

  /** host:port of asset-service's gRPC server. */
  @IsString()
  ASSET_SERVICE_URL!: string;

  /** Deadline for read RPCs (GetAsset, BatchGetAssets, ListAssets, GetUploadPartUrls). */
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
