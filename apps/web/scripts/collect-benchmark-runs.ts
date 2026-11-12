/**
 * Bundles the committed benchmark runs (`docs/benchmarks/runs/*.json`, ADR 014) into one JSON
 * file that the Experiments page imports, so the page shows exactly the runs of the commit it
 * was built from and reads nothing from disk at runtime (ADR 015). Runs before every web
 * script, like the GraphQL codegen; the output is not committed.
 *
 * Validation is not done here: the page parses the bundle with its zod schema, and a unit test
 * parses every committed run, so a malformed file fails `pnpm test` and the build.
 *
 * Plain Node (type stripping, no imports from `src/`), so it needs no TypeScript runner.
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const RUNS_DIR = join(import.meta.dirname, '../../../docs/benchmarks/runs');
const OUTPUT = join(
  import.meta.dirname,
  '../src/features/experiments/api/benchmark-runs.generated.json',
);

async function collect(): Promise<void> {
  // A missing directory is a broken checkout or build context, not "no runs": fail loudly.
  const files = (await readdir(RUNS_DIR)).filter((file) => file.endsWith('.json')).sort();
  const runs: { file: string; record: unknown }[] = [];

  for (const file of files) {
    const text = await readFile(join(RUNS_DIR, file), 'utf8');

    try {
      runs.push({ file, record: JSON.parse(text) as unknown });
    } catch (error) {
      throw new Error(`${file} is not valid JSON`, { cause: error });
    }
  }

  const output = `${JSON.stringify(runs)}\n`;
  const previous = await readFile(OUTPUT, 'utf8').catch(() => null);

  // Rewriting an unchanged file would make `next dev` recompile the page for nothing.
  if (output !== previous) {
    await mkdir(dirname(OUTPUT), { recursive: true });
    await writeFile(OUTPUT, output);
  }

  process.stdout.write(`benchmark runs: ${String(runs.length)} bundled\n`);
}

await collect();
