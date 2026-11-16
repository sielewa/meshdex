import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RunProbe } from './run-probe';
import { RunsService } from './runs.service';

describe('RunsService', () => {
  const recorder = new RunsService();
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ingest-runs-'));
  });

  afterEach(async () => {
    await rm(dir, {
      recursive: true,
      force: true,
    });
  });

  const record = {
    version: 1,
    command: 'import',
    label: 'baseline',
    startedAt: '2026-11-12T18:00:00.123Z',
    options: { queueSize: 4 },
    environment: {
      node: 'v24',
      platform: 'darwin',
      arch: 'arm64',
      cpuModel: 'test',
      cpuCount: 1,
      totalMemoryBytes: 1,
      gitCommit: null,
      gitDirty: null,
    },
    measurements: new RunProbe().stop(),
    result: { modelsImported: 1 },
  };

  it('writes the record under a sortable, file-system-safe name', async () => {
    const path = await recorder.write(join(dir, 'runs'), record);

    expect(path).toBe(join(dir, 'runs', '2026-11-12T18-00-00-123Z-import-baseline.json'));
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(record);
  });

  it('describes the machine and the commit the code ran from', async () => {
    const environment = await recorder.environment();

    expect(environment.cpuCount).toBeGreaterThan(0);
    // The tests run inside the repository checkout.
    expect(environment.gitCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(typeof environment.gitDirty).toBe('boolean');
  });

  it('never overwrites a recorded run', async () => {
    await recorder.write(dir, record);

    await expect(recorder.write(dir, record)).rejects.toMatchObject({ code: 'EEXIST' });
  });
});
