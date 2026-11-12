import { appendFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { PinoLogger } from 'nestjs-pino';
import type { ImportRecord } from './domain/import-record.interface';
import { ImportStateService } from './import-state.service';

function record(modelId: string): ImportRecord {
  return {
    modelId,
    resolution: '1k',
    assetId: `asset-${modelId}`,
    assetVersionId: `version-${modelId}`,
    sizeBytes: 100,
    importedAt: '2026-11-12T12:00:00.000Z',
  };
}

describe('ImportStateService', () => {
  const logger = { warn: jest.fn() } as unknown as PinoLogger;
  let dir: string;
  let path: string;
  let state: ImportStateService;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ingest-state-'));
    path = join(dir, 'runs', 'import-state.jsonl');
    state = new ImportStateService(logger);
  });

  afterEach(async () => {
    await rm(dir, {
      recursive: true,
      force: true,
    });
  });

  it('starts empty when there is no file', async () => {
    await expect(state.load(path)).resolves.toEqual([]);
  });

  it('appends one line per record and reads them back', async () => {
    await state.append(path, record('Chair_01'));
    await state.append(path, record('Table_01'));

    expect((await readFile(path, 'utf8')).split('\n')).toHaveLength(3);
    expect(await state.load(path)).toEqual([record('Chair_01'), record('Table_01')]);
  });

  it('keeps every line whole when appends run in parallel', async () => {
    const ids = Array.from({ length: 50 }, (_, index) => `Model_${String(index)}`);

    await Promise.all(ids.map((id) => state.append(path, record(id))));

    expect((await state.load(path)).map((loaded) => loaded.modelId).sort()).toEqual(ids.sort());
  });

  it('skips a line cut short by a crash', async () => {
    await state.append(path, record('Chair_01'));
    await appendFile(path, '{"modelId":"Table_01","resol');

    expect(await state.load(path)).toEqual([record('Chair_01')]);
  });
});
