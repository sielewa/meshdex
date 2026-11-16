import type { ConfigType } from '@nestjs/config';
import type { uploadConfig } from '../config/config.namespaces';
import type { Database } from '../database/domain/database.type';
import { StoragePartsRejectedException } from '../storage/exceptions/storage-parts-rejected.exception';
import { StorageUploadNotFoundException } from '../storage/exceptions/storage-upload-not-found.exception';
import type { ObjectStorage } from '../storage/domain/object-storage-port.interface';
import type { Asset } from './domain/asset.interface';
import { AssetVersionStatus } from './domain/asset-version-status.enum';
import type { VersionUpload } from './domain/version-upload.interface';
import { InvalidUploadRequestException } from './exceptions/invalid-upload-request.exception';
import { InvalidAssetVersionIdException } from './exceptions/invalid-asset-version-id.exception';
import { SourcePreviewMissingException } from './exceptions/source-preview-missing.exception';
import { UploadNotInProgressException } from './exceptions/upload-not-in-progress.exception';
import type { CatalogService } from '../catalog/catalog.service';
import type { AssetVersionsRepository } from './infrastructure/asset-versions.repository';
import { AssetUploadService } from './asset-upload.service';

const MIB = 1024 * 1024;

const ASSET_ID = '019a7a5e-8b1c-7c3d-9e4f-0000000000a1';
const VERSION_ID = '019a7a5e-8b1c-7c3d-9e4f-0000000000b1';
const MISSING_VERSION_ID = '019a7a5e-8b1c-7c3d-9e4f-0000000000ff';

describe('AssetUploadService', () => {
  const tx = { tx: true };
  let storage: { [K in keyof ObjectStorage]: jest.Mock };
  let assetsRepository: { create: jest.Mock; touch: jest.Mock; deleteById: jest.Mock };
  let versionsRepository: {
    createUploading: jest.Mock;
    findUploadById: jest.Mock;
    markUploaded: jest.Mock;
    deleteById: jest.Mock;
  };
  let tagsRepository: { linkToAsset: jest.Mock };
  let outboxRepository: { append: jest.Mock };
  let catalogService: { getAsset: jest.Mock };
  let service: AssetUploadService;

  const uploading: VersionUpload = {
    versionId: VERSION_ID,
    assetId: ASSET_ID,
    number: 1,
    status: AssetVersionStatus.UPLOADING,
    originalKey: `originals/${ASSET_ID}/${VERSION_ID}.glb`,
    sizeBytes: 20 * MIB,
    contentType: 'model/gltf-binary',
    uploadId: 'upload-1',
    partSizeBytes: 16 * MIB,
    sourcePreview: null,
  };
  const assetView = { id: ASSET_ID } as Asset;
  const twoParts = [
    {
      partNumber: 2,
      etag: '"b"',
    },
    {
      partNumber: 1,
      etag: '"a"',
    },
  ];

  beforeEach(() => {
    storage = {
      createMultipartUpload: jest.fn().mockResolvedValue('upload-1'),
      presignUploadPart: jest.fn((_key: string, _id: string, part: number) =>
        Promise.resolve(`https://s3/part-${String(part)}`),
      ),
      completeMultipartUpload: jest.fn().mockResolvedValue(undefined),
      abortMultipartUpload: jest.fn().mockResolvedValue(undefined),
      presignDownload: jest.fn(),
      presignPut: jest.fn().mockResolvedValue('https://s3/preview'),
      deleteObject: jest.fn().mockResolvedValue(undefined),
      headObject: jest.fn().mockResolvedValue({
        sizeBytes: 20 * MIB,
        contentType: null,
      }),
    };
    assetsRepository = {
      create: jest.fn(),
      touch: jest.fn(),
      deleteById: jest.fn(),
    };
    versionsRepository = {
      createUploading: jest.fn(),
      findUploadById: jest.fn().mockResolvedValue(uploading),
      markUploaded: jest.fn().mockResolvedValue(true),
      deleteById: jest.fn(),
    };
    tagsRepository = { linkToAsset: jest.fn() };
    outboxRepository = { append: jest.fn() };
    catalogService = { getAsset: jest.fn().mockResolvedValue(assetView) };

    const db = {
      transaction: (work: (transaction: unknown) => Promise<unknown>) => work(tx),
    } as unknown as Database;
    const config: ConfigType<typeof uploadConfig> = {
      maxSizeBytes: 512 * MIB,
      partSizeBytes: 16 * MIB,
      urlTtlSeconds: 3600,
    };

    service = new AssetUploadService(
      db,
      storage,
      config,
      assetsRepository,
      versionsRepository as unknown as AssetVersionsRepository,
      tagsRepository,
      outboxRepository,
      catalogService as unknown as CatalogService,
    );
  });

  describe('initiate', () => {
    const input = {
      title: '  Wooden chair ',
      tags: ['Furniture', 'wooden chair'],
      fileName: 'chair.GLB',
      contentType: 'model/gltf-binary',
      sizeBytes: 40 * MIB,
      sourcePreview: null,
    };

    it('starts the storage upload, records asset, version and tags, and signs every part', async () => {
      const upload = await service.initiate(input);

      expect(storage.createMultipartUpload).toHaveBeenCalledWith(
        `originals/${upload.assetId}/${upload.versionId}.glb`,
        'model/gltf-binary',
      );
      expect(assetsRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          id: upload.assetId,
          title: 'Wooden chair',
        }),
        tx,
      );
      expect(versionsRepository.createUploading).toHaveBeenCalledWith(
        expect.objectContaining({
          uploadId: 'upload-1',
          number: 1,
          partSizeBytes: 16 * MIB,
        }),
        tx,
      );
      expect(tagsRepository.linkToAsset).toHaveBeenCalledWith(
        upload.assetId,
        ['furniture', 'wooden-chair'],
        tx,
      );
      expect(upload.parts.map((part) => part.partNumber)).toEqual([1, 2, 3]);
    });

    it('rejects anything but GLB before touching storage', async () => {
      await expect(
        service.initiate({
          ...input,
          contentType: 'model/obj',
          fileName: 'chair.obj',
        }),
      ).rejects.toThrow(InvalidUploadRequestException);
      expect(storage.createMultipartUpload).not.toHaveBeenCalled();
    });

    it('rejects files above the size limit', async () => {
      await expect(
        service.initiate({
          ...input,
          sizeBytes: 513 * MIB,
        }),
      ).rejects.toThrow(InvalidUploadRequestException);
    });

    it('splits the file into parts with a smaller last part', async () => {
      const exact = await service.initiate({
        ...input,
        sizeBytes: 16 * MIB,
      });
      const oneByteMore = await service.initiate({
        ...input,
        sizeBytes: 16 * MIB + 1,
      });
      const largest = await service.initiate({
        ...input,
        sizeBytes: 512 * MIB,
      });

      expect(exact.parts).toHaveLength(1);
      expect(oneByteMore.parts).toHaveLength(2);
      expect(largest.parts).toHaveLength(32);
    });

    it('drops empty and duplicate tags, keeping input order', async () => {
      const upload = await service.initiate({
        ...input,
        tags: ['chair', ' ', 'Chair', 'table'],
      });

      expect(tagsRepository.linkToAsset).toHaveBeenCalledWith(
        upload.assetId,
        ['chair', 'table'],
        tx,
      );
    });

    it('rejects tags longer than the limit and more than 20 tags', async () => {
      const tooMany = Array.from({ length: 21 }, (_, index) => `tag-${String(index)}`);

      await expect(
        service.initiate({
          ...input,
          tags: ['x'.repeat(51)],
        }),
      ).rejects.toThrow(InvalidUploadRequestException);
      await expect(
        service.initiate({
          ...input,
          tags: tooMany,
        }),
      ).rejects.toThrow(InvalidUploadRequestException);
    });
  });

  describe('getPartUrls', () => {
    it('re-signs all parts for an empty list and each requested part once', async () => {
      await expect(service.getPartUrls(VERSION_ID, [])).resolves.toHaveLength(2);

      const parts = await service.getPartUrls(VERSION_ID, [2, 2]);

      expect(parts.map((part) => part.partNumber)).toEqual([2]);
    });

    it('rejects part numbers outside the upload', async () => {
      await expect(service.getPartUrls(VERSION_ID, [3])).rejects.toThrow(
        InvalidUploadRequestException,
      );
    });
  });

  describe('complete', () => {
    it('rejects missing, duplicated or unsigned parts before calling storage', async () => {
      const attempts = [
        [
          {
            partNumber: 1,
            etag: '"a"',
          },
        ],
        [
          {
            partNumber: 1,
            etag: '"a"',
          },
          {
            partNumber: 1,
            etag: '"a"',
          },
        ],
        [
          {
            partNumber: 1,
            etag: '"a"',
          },
          {
            partNumber: 2,
            etag: '',
          },
        ],
      ];

      for (const parts of attempts) {
        await expect(service.complete(VERSION_ID, parts)).rejects.toThrow(
          InvalidUploadRequestException,
        );
      }
      expect(storage.completeMultipartUpload).not.toHaveBeenCalled();
    });

    it('assembles the parts in order and records the uploaded event once', async () => {
      await expect(service.complete(VERSION_ID, twoParts)).resolves.toBe(assetView);

      expect(storage.completeMultipartUpload).toHaveBeenCalledWith(
        uploading.originalKey,
        'upload-1',
        [
          {
            partNumber: 1,
            etag: '"a"',
          },
          {
            partNumber: 2,
            etag: '"b"',
          },
        ],
      );
      expect(versionsRepository.markUploaded).toHaveBeenCalledWith(
        VERSION_ID,
        expect.any(Number),
        tx,
      );
      expect(outboxRepository.append).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'asset.uploaded',
          key: ASSET_ID,
          topic: 'asset.events.v1',
        }),
        tx,
      );
    });

    it('returns the asset without side effects when the version is already uploaded', async () => {
      versionsRepository.findUploadById.mockResolvedValue({
        ...uploading,
        status: AssetVersionStatus.UPLOADED,
      });

      await expect(service.complete(VERSION_ID, twoParts)).resolves.toBe(assetView);
      expect(storage.completeMultipartUpload).not.toHaveBeenCalled();
      expect(outboxRepository.append).not.toHaveBeenCalled();
    });

    it('finishes the database half when storage already completed the upload', async () => {
      storage.completeMultipartUpload.mockRejectedValue(new StorageUploadNotFoundException());

      await service.complete(VERSION_ID, twoParts);

      expect(versionsRepository.markUploaded).toHaveBeenCalled();
      expect(outboxRepository.append).toHaveBeenCalled();
    });

    it('records no event when a concurrent call won the transition', async () => {
      versionsRepository.markUploaded.mockResolvedValue(false);

      await service.complete(VERSION_ID, twoParts);

      expect(outboxRepository.append).not.toHaveBeenCalled();
    });

    it('rejects parts that storage does not accept', async () => {
      storage.completeMultipartUpload.mockRejectedValue(new StoragePartsRejectedException());

      await expect(service.complete(VERSION_ID, twoParts)).rejects.toThrow(
        InvalidUploadRequestException,
      );
    });

    it('rejects an object whose size differs from the declared one', async () => {
      storage.headObject.mockResolvedValue({
        sizeBytes: 1,
        contentType: null,
      });

      await expect(service.complete(VERSION_ID, twoParts)).rejects.toThrow(
        InvalidUploadRequestException,
      );
      expect(versionsRepository.markUploaded).not.toHaveBeenCalled();
    });
  });

  describe('abort', () => {
    it('frees the storage parts and removes a never-published asset', async () => {
      await service.abort(VERSION_ID);

      expect(storage.abortMultipartUpload).toHaveBeenCalledWith(uploading.originalKey, 'upload-1');
      expect(assetsRepository.deleteById).toHaveBeenCalledWith(ASSET_ID, tx);
    });

    it('rejects a malformed version id before querying, in every upload RPC', async () => {
      await expect(service.abort('42')).rejects.toThrow(InvalidAssetVersionIdException);
      await expect(service.complete('42', twoParts)).rejects.toThrow(
        InvalidAssetVersionIdException,
      );
      await expect(service.getPartUrls('42', [])).rejects.toThrow(InvalidAssetVersionIdException);
      expect(versionsRepository.findUploadById).not.toHaveBeenCalled();
    });

    it('succeeds for an unknown version (idempotent)', async () => {
      versionsRepository.findUploadById.mockResolvedValue(null);

      await expect(service.abort(MISSING_VERSION_ID)).resolves.toBeUndefined();
    });

    it('refuses to abort a completed upload', async () => {
      versionsRepository.findUploadById.mockResolvedValue({
        ...uploading,
        status: AssetVersionStatus.UPLOADED,
      });

      await expect(service.abort(VERSION_ID)).rejects.toThrow(UploadNotInProgressException);
    });
  });

  describe('source preview (ADR 017)', () => {
    const input = {
      title: 'Alarm clock',
      tags: [],
      fileName: 'alarm_clock_01.glb',
      contentType: 'model/gltf-binary',
      sizeBytes: 20 * MIB,
      sourcePreview: {
        contentType: 'image/webp',
        sizeBytes: 150_000,
      },
    };
    const previewKey = `public/previews/${ASSET_ID}/${VERSION_ID}.webp`;
    const withPreview: VersionUpload = {
      ...uploading,
      sourcePreview: {
        key: previewKey,
        sizeBytes: 150_000,
        contentType: 'image/webp',
      },
    };

    /** HEAD answers for the original and the image separately. */
    function storedObjects(preview: { sizeBytes: number } | null): void {
      storage.headObject.mockImplementation((key: string) =>
        Promise.resolve(
          key === previewKey
            ? preview && { ...preview, contentType: 'image/webp' }
            : { sizeBytes: 20 * MIB, contentType: null },
        ),
      );
    }

    it('stores the declared image under the public prefix and signs one PUT for it', async () => {
      const upload = await service.initiate(input);
      const key = `public/previews/${upload.assetId}/${upload.versionId}.webp`;

      expect(versionsRepository.createUploading).toHaveBeenCalledWith(
        expect.objectContaining({
          sourcePreview: {
            key,
            sizeBytes: 150_000,
            contentType: 'image/webp',
          },
        }),
        tx,
      );
      expect(storage.presignPut).toHaveBeenCalledWith(key, 'image/webp', 3600);
      expect(upload.sourcePreviewUpload?.url).toBe('https://s3/preview');
    });

    it('signs nothing extra when no image is declared', async () => {
      const upload = await service.initiate({ ...input, sourcePreview: null });

      expect(storage.presignPut).not.toHaveBeenCalled();
      expect(upload.sourcePreviewUpload).toBeNull();
    });

    it.each([
      ['an SVG (it can carry scripts)', { contentType: 'image/svg+xml', sizeBytes: 1000 }],
      ['a prototype key passed off as a type', { contentType: 'constructor', sizeBytes: 1000 }],
      ['an empty image', { contentType: 'image/png', sizeBytes: 0 }],
      ['an image above 2 MB', { contentType: 'image/png', sizeBytes: 2_000_001 }],
    ])('rejects %s before touching storage', async (_case, sourcePreview) => {
      await expect(service.initiate({ ...input, sourcePreview })).rejects.toThrow(
        InvalidUploadRequestException,
      );
      expect(storage.createMultipartUpload).not.toHaveBeenCalled();
    });

    it('completes once the declared image is stored', async () => {
      versionsRepository.findUploadById.mockResolvedValue(withPreview);
      storedObjects({ sizeBytes: 150_000 });

      await expect(service.complete(VERSION_ID, twoParts)).resolves.toBe(assetView);
      expect(versionsRepository.markUploaded).toHaveBeenCalled();
    });

    it('refuses to complete without the declared image, before assembling the parts', async () => {
      versionsRepository.findUploadById.mockResolvedValue(withPreview);
      storedObjects(null);

      await expect(service.complete(VERSION_ID, twoParts)).rejects.toThrow(
        SourcePreviewMissingException,
      );
      expect(storage.completeMultipartUpload).not.toHaveBeenCalled();
      expect(versionsRepository.markUploaded).not.toHaveBeenCalled();
    });

    it('rejects an image whose size differs from the declared one', async () => {
      versionsRepository.findUploadById.mockResolvedValue(withPreview);
      storedObjects({ sizeBytes: 99 });

      await expect(service.complete(VERSION_ID, twoParts)).rejects.toThrow(
        InvalidUploadRequestException,
      );
      expect(storage.completeMultipartUpload).not.toHaveBeenCalled();
    });

    it('deletes the public image when the upload is aborted', async () => {
      versionsRepository.findUploadById.mockResolvedValue(withPreview);

      await service.abort(VERSION_ID);

      expect(storage.deleteObject).toHaveBeenCalledWith(previewKey);
    });
  });
});
