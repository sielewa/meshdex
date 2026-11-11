import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsString, IsUrl, Max, Min } from 'class-validator';
import { validateConfig } from '@meshdex/shared';

const MIB = 1024 * 1024;

/** Parses "true"/"false" env strings; anything else stays as-is and fails `@IsBoolean`. */
const toBoolean = ({ value }: { value: unknown }): unknown =>
  value === 'true' ? true : value === 'false' ? false : value;

/**
 * Every environment variable asset-service reads, validated once at startup (ADR 007).
 * Modules never touch `process.env`; they inject their config namespace instead.
 */
export class AssetServiceEnv {
  /** host:port the gRPC server binds to. */
  @IsString()
  GRPC_URL!: string;

  @IsUrl({ protocols: ['postgres', 'postgresql'], require_tld: false })
  DATABASE_URL!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  DATABASE_POOL_MAX!: number;

  @IsUrl({ protocols: ['http', 'https'], require_tld: false })
  S3_ENDPOINT!: string;

  @IsString()
  S3_REGION!: string;

  @IsString()
  S3_BUCKET!: string;

  @IsString()
  S3_ACCESS_KEY_ID!: string;

  @IsString()
  S3_SECRET_ACCESS_KEY!: string;

  @Transform(toBoolean)
  @IsBoolean()
  S3_FORCE_PATH_STYLE!: boolean;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  UPLOAD_MAX_SIZE_BYTES!: number;

  /** S3 rejects parts below 5 MiB (except the last one). */
  @Type(() => Number)
  @IsInt()
  @Min(5 * MIB)
  @Max(5 * 1024 * MIB)
  UPLOAD_PART_SIZE_BYTES!: number;

  @Type(() => Number)
  @IsInt()
  @Min(60)
  @Max(7 * 24 * 3600)
  UPLOAD_URL_TTL_SECONDS!: number;

  @IsIn(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
  LOG_LEVEL!: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

  @Transform(toBoolean)
  @IsBoolean()
  LOG_PRETTY!: boolean;
}

let validatedEnv: AssetServiceEnv | undefined;

/**
 * Validates `process.env` on first use and caches the result, so all config
 * namespaces (and `main.ts`, which needs the gRPC URL before Nest starts) share
 * one validation pass. Throws `ConfigValidationException` listing every problem.
 */
export function assetServiceEnv(): AssetServiceEnv {
  validatedEnv ??= validateConfig(AssetServiceEnv, process.env);

  return validatedEnv;
}
