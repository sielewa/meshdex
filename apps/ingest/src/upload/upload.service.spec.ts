import type { PinoLogger } from 'nestjs-pino';
import type { AssetServicePort } from '../clients/asset-service/domain/asset-service-port.interface';
import type { CompletedPart } from '../clients/asset-service/domain/completed-part.interface';
import type { InitiateUploadCommand } from '../clients/asset-service/domain/initiate-upload-command.interface';
import type { UploadPartUrl } from '../clients/asset-service/domain/upload-part-url.interface';
import type { UploadSession } from '../clients/asset-service/domain/upload-session.interface';
import { AssetServiceRequestException } from '../clients/asset-service/exceptions/asset-service-request.exception';
import type { PresignedUploadPort } from '../clients/object-storage/domain/presigned-upload-port.interface';
import { PartUploadException } from '../clients/object-storage/exceptions/part-upload.exception';
import { TasksService } from '../tasks/tasks.service';
import { UploadService } from './upload.service';

const PART_SIZE = 4;

/** asset-service that signs `https://storage/v1/<part>?sig=<n>` URLs and records every call. */
class FakeAssetService implements AssetServicePort {
  initiated: InitiateUploadCommand[] = [];
  completed: CompletedPart[] | null = null;
  aborted: string[] = [];
  resigned: number[] = [];
  failInitiate = false;
  failComplete = false;
  private signatures = 0;

  initiateUpload(command: InitiateUploadCommand): Promise<UploadSession> {
    this.initiated.push(command);

    if (this.failInitiate) {
      return Promise.reject(new AssetServiceRequestException('asset-service: too big', false));
    }

    const partCount = Math.ceil(command.sizeBytes / PART_SIZE);

    return Promise.resolve({
      assetId: 'asset-1',
      assetVersionId: 'version-1',
      partSizeBytes: PART_SIZE,
      parts: Array.from({ length: partCount }, (_, index) => this.sign(index + 1)),
      sourcePreviewUploadUrl: command.sourcePreview ? 'https://storage/v1/preview?sig=p' : null,
    });
  }

  getUploadPartUrls(_versionId: string, partNumbers: number[]): Promise<UploadPartUrl[]> {
    this.resigned.push(...partNumbers);

    return Promise.resolve(partNumbers.map((partNumber) => this.sign(partNumber)));
  }

  completeUpload(_versionId: string, parts: CompletedPart[]): Promise<void> {
    if (this.failComplete) {
      return Promise.reject(new AssetServiceRequestException('asset-service: size', false));
    }

    this.completed = parts;

    return Promise.resolve();
  }

  abortUpload(versionId: string): Promise<void> {
    this.aborted.push(versionId);

    return Promise.resolve();
  }

  private sign(partNumber: number): UploadPartUrl {
    this.signatures += 1;

    return {
      partNumber,
      url: `https://storage/v1/${String(partNumber)}?sig=${String(this.signatures)}`,
      expiresAt: 0,
    };
  }
}

/** Storage that keeps the bytes per URL; `failures` are thrown, in order, before succeeding. */
class FakeStorage implements PresignedUploadPort {
  readonly puts: { url: string; bytes: number[] }[] = [];
  readonly objects: { url: string; bytes: number[]; contentType: string }[] = [];
  failures: PartUploadException[] = [];
  objectFailures: PartUploadException[] = [];

  putObject(url: string, body: Uint8Array, contentType: string): Promise<void> {
    const failure = this.objectFailures.shift();

    if (failure !== undefined) {
      return Promise.reject(failure);
    }

    this.objects.push({
      url,
      bytes: [...body],
      contentType,
    });

    return Promise.resolve();
  }

  putPart(url: string, body: Uint8Array): Promise<string> {
    const failure = this.failures.shift();

    if (failure !== undefined) {
      return Promise.reject(failure);
    }

    this.puts.push({
      url,
      bytes: [...body],
    });

    return Promise.resolve(`"etag-${String(this.puts.length)}"`);
  }
}

describe('UploadService', () => {
  const logger = {
    debug: jest.fn(),
    warn: jest.fn(),
  } as unknown as PinoLogger;
  const signal = new AbortController().signal;
  let assetService: FakeAssetService;
  let storage: FakeStorage;
  let uploader: UploadService;
  const upload = {
    title: 'Chair',
    tags: ['polyhaven'],
    fileName: 'Chair_01.glb',
    glb: Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
    sourcePreview: null,
  };

  beforeEach(() => {
    assetService = new FakeAssetService();
    storage = new FakeStorage();
    uploader = new UploadService(assetService, storage, new TasksService(logger), logger);
    // Full jitter with random() = 0 → retries without waiting.
    jest.spyOn(Math, 'random').mockReturnValue(0);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('declares the GLB, uploads it part by part and completes with the ETags', async () => {
    await expect(uploader.upload(upload, signal)).resolves.toEqual({
      assetId: 'asset-1',
      assetVersionId: 'version-1',
    });

    expect(assetService.initiated).toEqual([
      {
        title: 'Chair',
        tags: ['polyhaven'],
        fileName: 'Chair_01.glb',
        contentType: 'model/gltf-binary',
        sizeBytes: 10,
        sourcePreview: null,
      },
    ]);
    expect(storage.objects).toEqual([]);
    expect(storage.puts.map((put) => put.bytes)).toEqual([
      [1, 2, 3, 4],
      [5, 6, 7, 8],
      [9, 10],
    ]);
    expect(assetService.completed).toEqual([
      { partNumber: 1, etag: '"etag-1"' },
      { partNumber: 2, etag: '"etag-2"' },
      { partNumber: 3, etag: '"etag-3"' },
    ]);
  });

  it('retries a part after a transient failure with the same URL', async () => {
    storage.failures = [new PartUploadException('HTTP 503', 503)];

    await uploader.upload(upload, signal);

    expect(assetService.resigned).toEqual([]);
    expect(storage.puts[0]?.url).toBe('https://storage/v1/1?sig=1');
  });

  it('signs a part again when its URL was rejected', async () => {
    storage.failures = [new PartUploadException('HTTP 403', 403)];

    await uploader.upload(upload, signal);

    expect(assetService.resigned).toEqual([1]);
    expect(storage.puts[0]?.url).toBe('https://storage/v1/1?sig=4');
  });

  it('aborts the upload when a part keeps failing', async () => {
    storage.failures = [400, 400, 400].map((status) => new PartUploadException('HTTP', status));

    await expect(uploader.upload(upload, signal)).rejects.toThrow(PartUploadException);
    expect(assetService.aborted).toEqual(['version-1']);
    expect(assetService.completed).toBeNull();
  });

  it('aborts the upload when completing fails', async () => {
    assetService.failComplete = true;

    await expect(uploader.upload(upload, signal)).rejects.toThrow('asset-service: size');
    expect(assetService.aborted).toEqual(['version-1']);
  });

  it('has nothing to abort when initiating fails, and does not retry it', async () => {
    assetService.failInitiate = true;

    await expect(uploader.upload(upload, signal)).rejects.toThrow('asset-service: too big');
    expect(assetService.initiated).toHaveLength(1);
    expect(assetService.aborted).toEqual([]);
  });

  describe('with a source preview (ADR 017)', () => {
    const withPreview = {
      ...upload,
      sourcePreview: {
        bytes: Uint8Array.from([42, 43]),
        contentType: 'image/webp',
      },
    };

    it('declares the image, PUTs it with its type before the parts, then completes', async () => {
      await uploader.upload(withPreview, signal);

      expect(assetService.initiated[0]?.sourcePreview).toEqual({
        contentType: 'image/webp',
        sizeBytes: 2,
      });
      expect(storage.objects).toEqual([
        {
          url: 'https://storage/v1/preview?sig=p',
          bytes: [42, 43],
          contentType: 'image/webp',
        },
      ]);
      expect(assetService.completed).toHaveLength(3);
    });

    it('retries the image after a transient failure', async () => {
      storage.objectFailures = [new PartUploadException('HTTP 503', 503)];

      await uploader.upload(withPreview, signal);

      expect(storage.objects).toHaveLength(1);
    });

    it('aborts when the image URL is rejected, since it cannot be signed again', async () => {
      storage.objectFailures = [new PartUploadException('HTTP 403', 403)];

      await expect(uploader.upload(withPreview, signal)).rejects.toThrow(PartUploadException);
      expect(storage.puts).toEqual([]);
      expect(assetService.aborted).toEqual(['version-1']);
    });
  });
});
