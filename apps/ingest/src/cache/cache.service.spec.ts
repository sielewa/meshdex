import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { CacheIntegrityException } from './exceptions/cache-integrity.exception';
import { UnsafeCachePathException } from './exceptions/unsafe-cache-path.exception';
import { CacheService } from './cache.service';

const content = Buffer.from('glTF bytes '.repeat(1000));
const expected = {
  path: 'scene.bin',
  sizeBytes: content.length,
  md5: createHash('md5').update(content).digest('hex'),
};

describe('CacheService', () => {
  let dir: string;
  let cache: CacheService;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ingest-cache-'));
    cache = new CacheService({ dir });
  });

  afterEach(async () => {
    await rm(dir, {
      recursive: true,
      force: true,
    });
  });

  it('writes a streamed file under its final name once size and MD5 match', async () => {
    const modelDir = cache.modelDir('ArmChair_01', '1k');
    const path = cache.filePath(modelDir, 'textures/scene.bin');

    // Small chunks: the hash is computed across chunk boundaries.
    await cache.writeFile(Readable.from(chunks(content, 7)), path, expected);

    expect(await readFile(path)).toEqual(content);
    expect(await cache.hasFile(path, expected)).toBe(true);
    expect(await readdir(join(modelDir, 'textures'))).toEqual(['scene.bin']);
  });

  it('rejects a truncated download and leaves no file behind', async () => {
    const modelDir = cache.modelDir('ArmChair_01', '1k');
    const path = cache.filePath(modelDir, 'scene.bin');

    await expect(
      cache.writeFile(Readable.from([content.subarray(0, 100)]), path, expected),
    ).rejects.toThrow(CacheIntegrityException);
    expect(await readdir(modelDir)).toEqual([]);
  });

  it('removes the partial file when the source stream fails', async () => {
    const modelDir = cache.modelDir('ArmChair_01', '1k');
    const path = cache.filePath(modelDir, 'scene.bin');
    const failing = new Readable({
      read() {
        this.destroy(new Error('socket reset'));
      },
    });

    await expect(cache.writeFile(failing, path, expected)).rejects.toThrow('socket reset');
    expect(await readdir(modelDir)).toEqual([]);
  });

  it('treats a file with a different MD5 as missing', async () => {
    const path = cache.filePath(cache.modelDir('ArmChair_01', '1k'), 'scene.bin');

    await cache.writeFile(Readable.from([content]), path, expected);

    expect(
      await cache.hasFile(path, {
        ...expected,
        md5: '0'.repeat(32),
      }),
    ).toBe(false);
    expect(await cache.hasFile(`${path}.missing`, expected)).toBe(false);
  });

  it('rejects paths and ids that would leave the cache folder', () => {
    const modelDir = cache.modelDir('ArmChair_01', '1k');

    expect(() => cache.filePath(modelDir, '../../outside.bin')).toThrow(UnsafeCachePathException);
    expect(() => cache.filePath(modelDir, '/etc/passwd')).toThrow(UnsafeCachePathException);
    expect(() => cache.modelDir('../ArmChair_01', '1k')).toThrow(UnsafeCachePathException);
    expect(() => cache.modelDir('.hidden', '1k')).toThrow(UnsafeCachePathException);
  });

  it('lists cached model folders sorted by id, ignoring stray files and hidden folders', async () => {
    await mkdir(join(dir, 'Table_01'));
    await mkdir(join(dir, 'ArmChair_01'));
    await mkdir(join(dir, '.trash'));
    await writeFile(join(dir, 'import-state.jsonl'), '');

    expect(await cache.listModelIds()).toEqual(['ArmChair_01', 'Table_01']);
    expect(await new CacheService({ dir: join(dir, 'missing') }).listModelIds()).toEqual([]);
  });

  it('reads back the manifest it wrote and returns null when there is none', async () => {
    const manifest = {
      modelId: 'ArmChair_01',
      name: 'Arm Chair 01',
      tags: ['chair'],
      categories: ['furniture'],
      authors: ['Someone'],
      resolution: '1k' as const,
      filesHash: 'abc',
      gltfPath: 'ArmChair_01_1k.gltf',
      files: [expected],
      fetchedAt: '2026-11-12T12:00:00.000Z',
    };

    await cache.writeFile(
      Readable.from([content]),
      cache.filePath(cache.modelDir('ArmChair_01', '1k'), 'scene.bin'),
      expected,
    );
    await cache.writeManifest(manifest);

    expect(await cache.readManifest('ArmChair_01', '1k')).toEqual(manifest);
    expect(await cache.readManifest('ArmChair_01', '2k')).toBeNull();
  });
});

function chunks(buffer: Buffer, size: number): Buffer[] {
  const parts: Buffer[] = [];

  for (let offset = 0; offset < buffer.length; offset += size) {
    parts.push(buffer.subarray(offset, offset + size));
  }

  return parts;
}
