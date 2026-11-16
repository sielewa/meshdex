import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
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
 * `<cache dir>/<model id>/<resolution>/`. A file appears under its final name only complete and
 * verified, so an interrupted run leaves at most a `.part` file.
 */
@Injectable()
export class CacheService {
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

  /** Paths come from the API, so one escaping the model's folder is rejected. */
  filePath(modelDir: string, relativePath: string): string {
    const target = resolve(modelDir, relativePath);

    if (isAbsolute(relativePath) || !target.startsWith(modelDir + sep)) {
      throw new UnsafeCachePathException(`File path "${relativePath}" leaves the model folder`);
    }

    return target;
  }

  async hasFile(path: string, expected: CachedFile): Promise<boolean> {
    const stats = await stat(path).catch(() => null);

    if (!stats?.isFile() || stats.size !== expected.sizeBytes) {
      return false;
    }

    return (await this.md5Of(path)) === expected.md5;
  }

  /**
   * Hashes while streaming, so the file is never held in memory or read twice; `pipeline`
   * carries backpressure from the disk back to the socket.
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

  /** For previews, whose size the API doesn't list: cut off past `maxBytes`. */
  async writeBoundedFile(
    source: Readable,
    path: string,
    maxBytes: number,
  ): Promise<{ sizeBytes: number; md5: string }> {
    const partial = `${path}${PARTIAL_FILE_SUFFIX}`;
    const hash = createHash('md5');
    let bytes = 0;

    await mkdir(dirname(path), { recursive: true });

    try {
      await pipeline(
        source,
        async function* (chunks: AsyncIterable<Buffer>) {
          for await (const chunk of chunks) {
            bytes += chunk.length;

            if (bytes > maxBytes) {
              throw new CacheIntegrityException(
                `${path}: larger than ${String(maxBytes)} bytes, download stopped`,
              );
            }

            hash.update(chunk);
            yield chunk;
          }
        },
        createWriteStream(partial),
      );
    } catch (error) {
      await rm(partial, { force: true });
      throw error;
    }

    if (bytes === 0) {
      await rm(partial, { force: true });
      throw new CacheIntegrityException(`${path}: empty download`);
    }

    await rename(partial, path);

    return {
      sizeBytes: bytes,
      md5: hash.digest('hex'),
    };
  }

  /** Small files only: the whole file is read into memory. */
  async readVerifiedFile(path: string, expected: CachedFile): Promise<Buffer> {
    const bytes = await readFile(path);
    const md5 = createHash('md5').update(bytes).digest('hex');

    if (bytes.length !== expected.sizeBytes || md5 !== expected.md5) {
      throw new CacheIntegrityException(
        `${expected.path}: cached file changed (got ${String(bytes.length)} B with MD5 ${md5}); fetch again`,
      );
    }

    return bytes;
  }

  /** Written last, via temporary file + rename. */
  async writeManifest(manifest: CachedModelManifest): Promise<void> {
    const path = join(this.modelDir(manifest.modelId, manifest.resolution), MANIFEST_FILE_NAME);
    const partial = `${path}${PARTIAL_FILE_SUFFIX}`;

    await writeFile(partial, `${JSON.stringify(manifest, null, 2)}\n`);
    await rename(partial, path);
  }

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

  async listModelIds(): Promise<string[]> {
    const entries = await readdir(this.config.dir, { withFileTypes: true }).catch(
      (error: unknown) => {
        // Checked by `code`, not `instanceof Error`: fs errors may come from another realm.
        if (
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 'ENOENT'
        ) {
          return [];
        }

        throw error;
      },
    );

    return entries
      .filter((entry) => entry.isDirectory() && SAFE_MODEL_ID.test(entry.name))
      .map((entry) => entry.name)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  }

  private async md5Of(path: string): Promise<string> {
    const hash = createHash('md5');

    for await (const chunk of createReadStream(path)) {
      hash.update(chunk as Buffer);
    }

    return hash.digest('hex');
  }
}
