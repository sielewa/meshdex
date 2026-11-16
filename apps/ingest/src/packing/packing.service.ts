import { readFile } from 'node:fs/promises';
import { type Document, type GLTF, type ILogger, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { CachedModelManifest } from '../cache/domain/cached-model-manifest.interface';
import { CacheService } from '../cache/cache.service';
import { UnsupportedGltfException } from './exceptions/unsupported-gltf.exception';

/**
 * `.gltf` + resources → one GLB (ADR 013). Files are read here and handed to `NodeIO` in
 * memory, so a URI that isn't a verified cached file (`../../secret`, `https://…`) fails the
 * model instead of being followed.
 */
@Injectable()
export class PackingService {
  private readonly io: NodeIO;

  constructor(
    private readonly cache: CacheService,
    @InjectPinoLogger(PackingService.name)
    private readonly logger: PinoLogger,
  ) {
    // Draco/meshopt would need decoders; Poly Haven doesn't use them, so such a model fails.
    this.io = new NodeIO().registerExtensions(ALL_EXTENSIONS).setLogger(this.gltfLogger());
  }

  async pack(manifest: CachedModelManifest): Promise<Uint8Array> {
    const modelDir = this.cache.modelDir(manifest.modelId, manifest.resolution);
    const json = JSON.parse(
      await readFile(this.cache.filePath(modelDir, manifest.gltfPath), 'utf8'),
    ) as GLTF.IGLTF;
    const resources = await this.readResources(json, modelDir, manifest);
    const document = await this.io.readJSON({
      json,
      resources,
    });

    this.assertNoExtensionDropped(json, document);

    return this.io.writeBinary(document);
  }

  /** Keyed by the URI as written (percent-encoded), which is how `NodeIO` looks them up. */
  private async readResources(
    json: GLTF.IGLTF,
    modelDir: string,
    manifest: CachedModelManifest,
  ): Promise<Record<string, Uint8Array<ArrayBuffer>>> {
    const cached = new Set(manifest.files.map((file) => file.path));
    const uris = [...(json.buffers ?? []), ...(json.images ?? [])]
      .map((resource) => resource.uri)
      .filter((uri): uri is string => uri !== undefined && !uri.startsWith('data:'));
    const resources: Record<string, Uint8Array<ArrayBuffer>> = {};

    await Promise.all(
      [...new Set(uris)].map(async (uri) => {
        const path = this.decodeUri(uri);

        if (path === null || !cached.has(path) || path === manifest.gltfPath) {
          throw new UnsupportedGltfException(
            `Resource "${uri}" is not among the model's cached files`,
          );
        }

        resources[uri] = await readFile(this.cache.filePath(modelDir, path));
      }),
    );

    return resources;
  }

  private decodeUri(uri: string): string | null {
    try {
      return decodeURIComponent(uri);
    } catch {
      return null;
    }
  }

  /** `NodeIO` drops unknown optional extensions with only a warning: glass would turn opaque. */
  private assertNoExtensionDropped(json: GLTF.IGLTF, document: Document): void {
    const kept = new Set(
      document
        .getRoot()
        .listExtensionsUsed()
        .map((extension) => extension.extensionName),
    );
    const dropped = (json.extensionsUsed ?? []).filter((name) => !kept.has(name));

    if (dropped.length > 0) {
      throw new UnsupportedGltfException(
        `glTF extensions the packer can't keep: ${dropped.join(', ')}`,
      );
    }
  }

  private gltfLogger(): ILogger {
    return {
      debug: (text) => {
        this.logger.debug(text);
      },
      info: (text) => {
        this.logger.debug(text);
      },
      warn: (text) => {
        this.logger.warn(text);
      },
      error: (text) => {
        this.logger.error(text);
      },
    };
  }
}
