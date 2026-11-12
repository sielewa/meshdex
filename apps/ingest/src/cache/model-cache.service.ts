import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import type { TextureResolution } from '../clients/polyhaven/domain/texture-resolution.type';
import { cacheConfig } from '../config/config.namespaces';
import { MANIFEST_FILE_NAME, PARTIAL_FILE_SUFFIX, SAFE_MODEL_ID } from './cache.constants';
import type { CachedFile } from './domain/cached-file.interface';
import type { CachedModelManifest } from './domain/cached-model-manifest.interface';
import { CacheIntegrityException } from './exceptions/cache-integrity.exception';
import { UnsafeCachePathException } from './exceptions/unsafe-cache-path.exception';

/**
 * The local model cache: `<cache dir>/<model id>/<resolution>/` holds a model's `.gltf`, its
 * resources and `model.json`. A file only ever appears under its final name complete and
 * verified, so an interrupted run leaves at most a `.part` file that the next run overwrites.
 */
@Injectable()
export class ModelCacheService {
  constructor(
    @Inject(cacheConfig.KEY)
    private readonly config: ConfigType<typeof cacheConfig>,
  ) {}

  modelDir(modelId: string, resolution: TextureResolution): string {
    if (!SAFE_MODEL_ID.test(modelId)) {
      throw new UnsafeCachePathException(`Model id "${modelId}" can't be used as a folder name`);
    }

    return join(this.config.dir, modelId, resolution);
  }

  /**
   * Absolute path of a model's file. Paths come from the API, so one like `../../x` (or an
   * absolute one) is rejected instead of being written outside the model's folder.
   */
  filePath(modelDir: string, relativePath: string): string {
    const target = resolve(modelDir, relativePath);

    if (isAbsolute(relativePath) || !target.startsWith(modelDir + sep)) {
      throw new UnsafeCachePathException(`File path "${relativePath}" leaves the model folder`);
    }

    return target;
  }

  /** True when the file exists with the expected size and MD5. */
  async hasFile(path: string, expected: CachedFile): Promise<boolean> {
    const stats = await stat(path).catch(() => null);

    if (!stats?.isFile() || stats.size !== expected.sizeBytes) {
      return false;
    }

    return (await this.md5Of(path)) === expected.md5;
  }

  /**
   * Streams `source` to `path`, computing the MD5 while the bytes pass through, so the file is
   * never held in memory and never read twice. `pipeline` propagates backpressure: when the
   * disk is slower than the network, the generator stops pulling and the socket stops reading.
   * The bytes go to `<path>.part` and are renamed only when size and MD5 match.
   */
  async writeFile(source: Readable, path: string, expected: CachedFile): Promise<void> {
    const partial = `${path}${PARTIAL_FILE_SUFFIX}`;
    const hash = createHash('md5');
    let bytes = 0;

    await mkdir(dirname(path), { recursive: true });

    try {
      await pipeline(
        source,
        async function* (chunks: AsyncIterable<Buffer>) {
          for await (const chunk of chunks) {
            hash.update(chunk);
            bytes += chunk.length;
            yield chunk;
          }
        },
        createWriteStream(partial),
      );
    } catch (error) {
      await rm(partial, { force: true });
      throw error;
    }

    const md5 = hash.digest('hex');

    if (bytes !== expected.sizeBytes || md5 !== expected.md5) {
      await rm(partial, { force: true });
      throw new CacheIntegrityException(
        `${expected.path}: got ${bytes} B with MD5 ${md5}, expected ${expected.sizeBytes} B with MD5 ${expected.md5}`,
      );
    }

    await rename(partial, path);
  }

  /** Written last and atomically (temporary file + rename), so it never exists half-written. */
  async writeManifest(manifest: CachedModelManifest): Promise<void> {
    const path = join(this.modelDir(manifest.modelId, manifest.resolution), MANIFEST_FILE_NAME);
    const partial = `${path}${PARTIAL_FILE_SUFFIX}`;

    await writeFile(partial, `${JSON.stringify(manifest, null, 2)}\n`);
    await rename(partial, path);
  }

  /** The model's manifest, or `null` when the model isn't (completely) cached. */
  async readManifest(
    modelId: string,
    resolution: TextureResolution,
  ): Promise<CachedModelManifest | null> {
    const path = join(this.modelDir(modelId, resolution), MANIFEST_FILE_NAME);

    try {
      const manifest = JSON.parse(await readFile(path, 'utf8')) as CachedModelManifest;

      return manifest.modelId === modelId ? manifest : null;
    } catch {
      return null;
    }
  }

  private async md5Of(path: string): Promise<string> {
    const hash = createHash('md5');

    for await (const chunk of createReadStream(path)) {
      hash.update(chunk as Buffer);
    }

    return hash.digest('hex');
  }
}
