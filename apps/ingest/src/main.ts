import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { parseArgs, type ParseArgsConfig } from 'node:util';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { ConfigValidationException, validateConfig } from '@meshdex/shared';
import { AppModule } from './app.module';
import { FetchArgs } from './fetch/dto/fetch.args';
import { FetchService } from './fetch/fetch.service';
import { ImportArgs } from './import/dto/import.args';
import { ImportService } from './import/import.service';

const USAGE = `Usage: ingest <command> [options]

Commands:
  fetch    Download models from Poly Haven into the local cache (ADR 013)
  import   Pack cached models into GLB and upload them to asset-service

Options (fetch):
  --resolution <1k|2k|4k>     Texture resolution (default 1k)
  --concurrency <n>           Models downloaded in parallel, 1-4 (default 2)
  --limit <n>                 Only the first n models by id
  --ids <a,b,...>             Only these model ids

Options (import):
  --resolution <1k|2k|4k>     Texture resolution of the cached models (default 1k)
  --pack-concurrency <n>      Models packed in parallel, 1-8 (default 2)
  --upload-concurrency <n>    Models uploaded in parallel, 1-16 (default 4)
  --queue-size <n>            Packed models waiting for upload, 1-32 (default 4)
  --limit <n>                 Only the first n cached models by id
  --ids <a,b,...>             Only these model ids
  --state <file>              Import state file (default <cache dir>/import-state.jsonl)

  --help                      Show this help
`;

/** Each command accepts only its own options; anything else is a usage error. */
const COMMAND_OPTIONS = {
  fetch: {
    resolution: { type: 'string', default: '1k' },
    concurrency: { type: 'string', default: '2' },
    limit: { type: 'string' },
    ids: { type: 'string' },
  },
  import: {
    resolution: { type: 'string', default: '1k' },
    'pack-concurrency': { type: 'string', default: '2' },
    'upload-concurrency': { type: 'string', default: '4' },
    'queue-size': { type: 'string', default: '4' },
    limit: { type: 'string' },
    ids: { type: 'string' },
    state: { type: 'string' },
  },
} satisfies Record<string, NonNullable<ParseArgsConfig['options']>>;

type Command = keyof typeof COMMAND_OPTIONS;

/** Exit codes: 0 done, 1 some models failed or ingest crashed, 2 bad usage, 130 interrupted. */
const EXIT_USAGE = 2;
const EXIT_INTERRUPTED = 130;

class UsageError extends Error {}

/** Local development only — in Kubernetes the environment comes from the ConfigMap. */
function loadLocalEnvFile(): void {
  if (existsSync('.env')) {
    process.loadEnvFile('.env');
  }
}

function isCommand(value: string | undefined): value is Command {
  return value !== undefined && Object.hasOwn(COMMAND_OPTIONS, value);
}

/** `--pack-concurrency 2` → `{ packConcurrency: '2' }`, `--ids a,b` → `{ ids: ['a', 'b'] }`. */
function parseOptions(command: Command, argv: string[]): Record<string, unknown> {
  const { values } = parseArgs({
    args: argv,
    options: COMMAND_OPTIONS[command],
  });
  const options: Record<string, unknown> = {};

  for (const [name, value] of Object.entries(values)) {
    const key = name.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());

    options[key] =
      key === 'ids' && typeof value === 'string'
        ? value
            .split(',')
            .map((id) => id.trim())
            .filter((id) => id !== '')
        : value;
  }

  return options;
}

function validateOptions<T extends object>(
  argsClass: new () => T,
  options: Record<string, unknown>,
): T {
  try {
    return validateConfig(argsClass, options);
  } catch (error) {
    if (error instanceof ConfigValidationException) {
      throw new UsageError(
        `Invalid options:\n${error.problems.map((problem) => `  - ${problem}`).join('\n')}`,
      );
    }

    throw error;
  }
}

async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2);

  if (command === undefined || command === '--help' || rest.includes('--help')) {
    process.stdout.write(USAGE);

    return command === undefined ? EXIT_USAGE : 0;
  }

  if (!isCommand(command)) {
    process.stderr.write(`Unknown command "${command}"\n\n${USAGE}`);

    return EXIT_USAGE;
  }

  let run: (app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>>) => Promise<{
    failures: unknown[];
  }>;
  // Ctrl+C aborts in-flight work; whatever finished stays (cached files, state file lines).
  const controller = new AbortController();

  try {
    const options = parseOptions(command, rest);

    if (command === 'fetch') {
      const args = validateOptions(FetchArgs, options);

      run = (app) => app.get(FetchService).run(args, controller.signal);
    } else {
      const args = validateOptions(ImportArgs, options);

      run = (app) => app.get(ImportService).run(args, controller.signal);
    }
  } catch (error) {
    // parseArgs throws plain errors (unknown option, missing value) with a clear message.
    const message = error instanceof Error ? error.message : String(error);

    process.stderr.write(`${message}\n\n${USAGE}`);

    return EXIT_USAGE;
  }

  loadLocalEnvFile();
  process.once('SIGINT', () => {
    controller.abort(new Error('Interrupted'));
  });

  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));

  try {
    const summary = await run(app);

    return summary.failures.length > 0 ? 1 : 0;
  } catch (error) {
    if (controller.signal.aborted) {
      return EXIT_INTERRUPTED;
    }

    throw error;
  } finally {
    await app.close();
  }
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);

    process.stderr.write(`ingest failed: ${message}\n`);
    process.exitCode = 1;
  });
