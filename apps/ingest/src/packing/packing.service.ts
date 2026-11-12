import { readFile } from 'node:fs/promises';
import { type Document, type GLTF, type ILogger, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { Injectable } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { CachedModelManifest } from '../cache/domain/cached-model-manifest.interface';
import { CacheService } from '../cache/cache.service';
import { UnsupportedGltfException } from './exceptions/unsupported-gltf.exception';

/**
 * Packs a cached `.gltf` with its `.bin` and textures into one GLB (ADR 013): the same glTF
 * 2.0 content in a single binary container, which is what asset-service accepts.
 *
 * The packer reads the files itself and hands `NodeIO` an in-memory `{ json, resources }`
 * document, so the library never touches the disk or the network: a resource URI that isn't
 * one of the model's verified cached files (`../../secret`, `https://…`) fails the model
 * instead of being followed. The whole model is in memory while it is packed; the import
 * pipeline bounds how many models that is.
 */
@Injectable()
export class PackingService {
  private readonly io: NodeIO;

  constructor(
    private readonly cache: CacheService,
    @InjectPinoLogger(PackingService.name)
    private readonly logger: PinoLogger,
  ) {
    // Every official Khronos/EXT extension (materials such as transmission, texture transforms…)
    // is read and written back as it is. Compressed geometry (Draco, meshopt) would also need
    // its decoder; Poly Haven doesn't use it, and such a model fails below instead of changing.
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

  /**
   * Loads every external buffer and image, keyed by the URI exactly as written in the JSON
   * (that is how `NodeIO` looks them up). URIs are percent-encoded per the glTF spec, the
   * manifest holds plain paths. `data:` URIs are embedded and decoded by the library.
   * A model's files are read in parallel: a handful per model, and libuv's thread pool
   * bounds the actual disk reads.
   */
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

  /**
   * `NodeIO` skips optional extensions it has no implementation for (a vendor extension, or
   * an official one newer than the library), with only a warning: a glass material would come
   * out opaque. A model whose content would change fails instead.
   * (Required extensions it doesn't know already make `readJSON` throw.)
   */
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

  /** The library's warnings go to pino like everything else, never to the console. */
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
