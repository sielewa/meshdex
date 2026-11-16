/**
 * Bundles the committed runs and the manifest into one JSON the Experiments page imports, so it
 * shows exactly the runs of its commit (ADR 015). Validated by the page's zod schema, not here.
 * Plain Node with type stripping: no imports from `src/`.
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const BENCHMARKS_DIR = join(import.meta.dirname, '../../../docs/benchmarks');
const RUNS_DIR = join(BENCHMARKS_DIR, 'runs');
const MANIFEST = join(BENCHMARKS_DIR, 'experiments.json');
const OUTPUT = join(
  import.meta.dirname,
  '../src/features/experiments/api/benchmark-runs.generated.json',
);

async function collect(): Promise<void> {
  // A missing directory is a broken checkout or build context, not "no runs": fail loudly.
  const files = (await readdir(RUNS_DIR)).filter((file) => file.endsWith('.json')).sort();
  const runs: { file: string; record: unknown }[] = [];

  for (const file of files) {
    runs.push({ file, record: await readJson(join(RUNS_DIR, file)) });
  }

  const experiments = await readJson(MANIFEST);
  const output = `${JSON.stringify({ experiments, runs })}\n`;
  const previous = await readFile(OUTPUT, 'utf8').catch(() => null);

  // Rewriting an unchanged file would make `next dev` recompile the page for nothing.
  if (output !== previous) {
    await mkdir(dirname(OUTPUT), { recursive: true });
    await writeFile(OUTPUT, output);
  }

  process.stdout.write(`benchmark runs: ${String(runs.length)} bundled with the experiments\n`);
}

async function readJson(path: string): Promise<unknown> {
  const text = await readFile(path, 'utf8');

  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error(`${path} is not valid JSON`, { cause: error });
  }
}

await collect();
