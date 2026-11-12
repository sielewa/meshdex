import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsNotEmpty, IsString, IsUrl } from 'class-validator';

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

  @IsIn(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
  LOG_LEVEL!: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

  @Transform(({ value }: { value: unknown }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean()
  LOG_PRETTY!: boolean;
}
