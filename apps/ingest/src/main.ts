import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { ConfigValidationException, validateConfig } from '@meshdex/shared';
import { AppModule } from './app.module';
import { FetchArgs } from './fetch/dto/fetch.args';
import { FetchService } from './fetch/fetch.service';

const USAGE = `Usage: ingest <command> [options]

Commands:
  fetch                    Download models from Poly Haven into the local cache (ADR 013)

Options (fetch):
  --resolution <1k|2k|4k>  Texture resolution (default 1k)
  --concurrency <n>        Models downloaded in parallel, 1-4 (default 2)
  --limit <n>              Only the first n models by id
  --ids <a,b,...>          Only these model ids
  --help                   Show this help
`;

/** Exit codes: 0 done, 1 some models failed or ingest crashed, 2 bad usage, 130 interrupted. */
const EXIT_USAGE = 2;
const EXIT_INTERRUPTED = 130;

/** Local development only — in Kubernetes the environment comes from the ConfigMap. */
function loadLocalEnvFile(): void {
  if (existsSync('.env')) {
    process.loadEnvFile('.env');
  }
}

function parseCommandLine(): { command: string | undefined; values: Record<string, unknown> } {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      resolution: { type: 'string', default: '1k' },
      concurrency: { type: 'string', default: '2' },
      limit: { type: 'string' },
      ids: { type: 'string' },
      help: { type: 'boolean', default: false },
    },
  });

  return {
    command: values.help ? undefined : positionals[0],
    values: {
      ...values,
      ids: values.ids
        ?.split(',')
        .map((id) => id.trim())
        .filter((id) => id !== ''),
    },
  };
}

async function main(): Promise<number> {
  let parsed: ReturnType<typeof parseCommandLine>;

  try {
    parsed = parseCommandLine();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n\n${USAGE}`);

    return EXIT_USAGE;
  }

  if (parsed.command !== 'fetch') {
    if (parsed.command !== undefined) {
      process.stderr.write(`Unknown command "${parsed.command}"\n\n`);
    }

    process.stdout.write(USAGE);

    return parsed.command === undefined && parsed.values.help === true ? 0 : EXIT_USAGE;
  }

  loadLocalEnvFile();

  const { help: _help, ...options } = parsed.values;
  let args: FetchArgs;

  try {
    args = validateConfig(FetchArgs, options);
  } catch (error) {
    if (!(error instanceof ConfigValidationException)) {
      throw error;
    }

    const problems = error.problems.map((problem) => `  - ${problem}`).join('\n');

    process.stderr.write(`Invalid options:\n${problems}\n\n${USAGE}`);

    return EXIT_USAGE;
  }

  // Ctrl+C aborts in-flight downloads; finished files stay cached, `.part` files are redone.
  const controller = new AbortController();

  process.once('SIGINT', () => {
    controller.abort(new Error('Interrupted'));
  });

  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));

  try {
    const summary = await app.get(FetchService).run(args, controller.signal);

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
