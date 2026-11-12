import { posix } from 'node:path';
import { Readable } from 'node:stream';
import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { polyhavenConfig } from '../../../config/config.namespaces';
import type { ModelFileSet } from '../domain/model-file-set.interface';
import type { PolyhavenModel } from '../domain/polyhaven-model.interface';
import type { PolyhavenPort } from '../domain/polyhaven-port.interface';
import type { RemoteFile } from '../domain/remote-file.interface';
import type { TextureResolution } from '../domain/texture-resolution.type';
import { PolyhavenRequestException } from '../exceptions/polyhaven-request.exception';
import {
  POLYHAVEN_REQUEST_TIMEOUT_MS,
  POLYHAVEN_RETRYABLE_STATUSES,
  POLYHAVEN_USER_AGENT,
} from '../polyhaven.constants';

/**
 * Poly Haven's public API over `fetch`. Responses are external data: every field ingest
 * uses is checked here, so the rest of the app works with typed, validated values.
 */
@Injectable()
export class HttpPolyhavenAdapter implements PolyhavenPort {
  constructor(
    @Inject(polyhavenConfig.KEY)
    private readonly config: ConfigType<typeof polyhavenConfig>,
  ) {}

  async listModels(signal: AbortSignal): Promise<PolyhavenModel[]> {
    const body = await this.getJson(`${this.config.apiUrl}/assets?type=models`, signal);

    if (!this.isRecord(body)) {
      throw new PolyhavenRequestException('Unexpected model list from Poly Haven', false);
    }

    return Object.entries(body).map(([id, raw]) => this.toModel(id, raw));
  }

  async findGltfFiles(
    modelId: string,
    resolution: TextureResolution,
    signal: AbortSignal,
  ): Promise<ModelFileSet | null> {
    const body = await this.getJson(
      `${this.config.apiUrl}/files/${encodeURIComponent(modelId)}`,
      signal,
    );
    // Shape: { gltf: { "1k": { gltf: { url, size, md5, include: { "<path>": { url, size, md5 } } } } } }
    const entry = this.field(this.field(this.field(body, 'gltf'), resolution), 'gltf');

    if (entry === undefined) {
      return null;
    }

    const gltf = this.toRemoteFile(this.fileNameOf(entry), entry);
    const include = this.field(entry, 'include');
    const resources = this.isRecord(include)
      ? Object.entries(include).map(([path, raw]) => this.toRemoteFile(path, raw))
      : [];

    return {
      gltfPath: gltf.path,
      files: [gltf, ...resources],
    };
  }

  async download(url: string, signal: AbortSignal): Promise<Readable> {
    // No overall timeout: a large file may legitimately take long. The caller aborts.
    const response = await this.request(url, signal);

    if (!response.body) {
      throw new PolyhavenRequestException(`Empty response body from ${url}`, true);
    }

    return Readable.fromWeb(response.body);
  }

  private async getJson(url: string, signal: AbortSignal): Promise<unknown> {
    const response = await this.request(url, signal, POLYHAVEN_REQUEST_TIMEOUT_MS);

    try {
      return await response.json();
    } catch {
      throw new PolyhavenRequestException(`Invalid JSON from ${url}`, true);
    }
  }

  /**
   * Sends the request with the User-Agent the API terms require. A caller's abort is
   * rethrown as is (not retryable); a timeout or network error becomes a retryable
   * `PolyhavenRequestException`.
   */
  private async request(url: string, signal: AbortSignal, timeoutMs?: number): Promise<Response> {
    const requestSignal =
      timeoutMs === undefined ? signal : AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]);
    let response: Response;

    try {
      response = await fetch(url, {
        headers: { 'user-agent': POLYHAVEN_USER_AGENT },
        signal: requestSignal,
      });
    } catch (error) {
      if (signal.aborted) {
        throw error;
      }

      const reason = error instanceof Error ? error.message : String(error);

      throw new PolyhavenRequestException(`Request to ${url} failed: ${reason}`, true);
    }

    if (!response.ok) {
      // Release the connection: an unread body keeps the socket busy.
      await response.body?.cancel();

      throw new PolyhavenRequestException(
        `Request to ${url} failed with HTTP ${response.status}`,
        POLYHAVEN_RETRYABLE_STATUSES.has(response.status),
      );
    }

    return response;
  }

  private toModel(id: string, raw: unknown): PolyhavenModel {
    const name = this.field(raw, 'name');
    const authors = this.field(raw, 'authors');
    const filesHash = this.field(raw, 'files_hash');

    return {
      id,
      name: typeof name === 'string' && name.trim() !== '' ? name.trim() : id,
      tags: this.strings(this.field(raw, 'tags')),
      categories: this.strings(this.field(raw, 'categories')),
      authors: this.isRecord(authors) ? Object.keys(authors) : [],
      filesHash: typeof filesHash === 'string' ? filesHash : null,
    };
  }

  private toRemoteFile(path: string, raw: unknown): RemoteFile {
    const url = this.field(raw, 'url');
    const size = this.field(raw, 'size');
    const md5 = this.field(raw, 'md5');

    if (
      typeof url !== 'string' ||
      !url.startsWith('https://') ||
      typeof size !== 'number' ||
      !Number.isSafeInteger(size) ||
      size < 0 ||
      typeof md5 !== 'string' ||
      !/^[0-9a-f]{32}$/.test(md5)
    ) {
      throw new PolyhavenRequestException(`Unexpected file entry "${path}" from Poly Haven`, false);
    }

    return {
      path,
      url,
      sizeBytes: size,
      md5,
    };
  }

  /** The `.gltf` itself has no path in the listing; its URL ends with the file name. */
  private fileNameOf(entry: unknown): string {
    const url = this.field(entry, 'url');

    if (typeof url !== 'string' || !URL.canParse(url)) {
      throw new PolyhavenRequestException('Unexpected glTF entry from Poly Haven', false);
    }

    return decodeURIComponent(posix.basename(new URL(url).pathname));
  }

  private field(value: unknown, key: string): unknown {
    return this.isRecord(value) ? value[key] : undefined;
  }

  private strings(value: unknown): string[] {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
