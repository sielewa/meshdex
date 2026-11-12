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
import { UploadNotInProgressException } from './exceptions/upload-not-in-progress.exception';
import type { CatalogService } from '../catalog/catalog.service';
import type { AssetVersionsRepository } from './infrastructure/asset-versions.repository';
import { UploadService } from './upload.service';

const MIB = 1024 * 1024;

describe('UploadService', () => {
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
  let service: UploadService;

  const uploading: VersionUpload = {
    versionId: 'version-1',
    assetId: 'asset-1',
    number: 1,
    status: AssetVersionStatus.UPLOADING,
    originalKey: 'originals/asset-1/version-1.glb',
    sizeBytes: 20 * MIB,
    contentType: 'model/gltf-binary',
    uploadId: 'upload-1',
    partSizeBytes: 16 * MIB,
  };
  const assetView = { id: 'asset-1' } as Asset;
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

    service = new UploadService(
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
      await expect(service.getPartUrls('version-1', [])).resolves.toHaveLength(2);

      const parts = await service.getPartUrls('version-1', [2, 2]);

      expect(parts.map((part) => part.partNumber)).toEqual([2]);
    });

    it('rejects part numbers outside the upload', async () => {
      await expect(service.getPartUrls('version-1', [3])).rejects.toThrow(
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
        await expect(service.complete('version-1', parts)).rejects.toThrow(
          InvalidUploadRequestException,
        );
      }
      expect(storage.completeMultipartUpload).not.toHaveBeenCalled();
    });

    it('assembles the parts in order and records the uploaded event once', async () => {
      await expect(service.complete('version-1', twoParts)).resolves.toBe(assetView);

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
        'version-1',
        expect.any(Number),
        tx,
      );
      expect(outboxRepository.append).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'asset.uploaded',
          key: 'asset-1',
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

      await expect(service.complete('version-1', twoParts)).resolves.toBe(assetView);
      expect(storage.completeMultipartUpload).not.toHaveBeenCalled();
      expect(outboxRepository.append).not.toHaveBeenCalled();
    });

    it('finishes the database half when storage already completed the upload', async () => {
      storage.completeMultipartUpload.mockRejectedValue(new StorageUploadNotFoundException());

      await service.complete('version-1', twoParts);

      expect(versionsRepository.markUploaded).toHaveBeenCalled();
      expect(outboxRepository.append).toHaveBeenCalled();
    });

    it('records no event when a concurrent call won the transition', async () => {
      versionsRepository.markUploaded.mockResolvedValue(false);

      await service.complete('version-1', twoParts);

      expect(outboxRepository.append).not.toHaveBeenCalled();
    });

    it('rejects parts that storage does not accept', async () => {
      storage.completeMultipartUpload.mockRejectedValue(new StoragePartsRejectedException());

      await expect(service.complete('version-1', twoParts)).rejects.toThrow(
        InvalidUploadRequestException,
      );
    });

    it('rejects an object whose size differs from the declared one', async () => {
      storage.headObject.mockResolvedValue({
        sizeBytes: 1,
        contentType: null,
      });

      await expect(service.complete('version-1', twoParts)).rejects.toThrow(
        InvalidUploadRequestException,
      );
      expect(versionsRepository.markUploaded).not.toHaveBeenCalled();
    });
  });

  describe('abort', () => {
    it('frees the storage parts and removes a never-published asset', async () => {
      await service.abort('version-1');

      expect(storage.abortMultipartUpload).toHaveBeenCalledWith(uploading.originalKey, 'upload-1');
      expect(assetsRepository.deleteById).toHaveBeenCalledWith('asset-1', tx);
    });

    it('succeeds for an unknown version (idempotent)', async () => {
      versionsRepository.findUploadById.mockResolvedValue(null);

      await expect(service.abort('missing')).resolves.toBeUndefined();
    });

    it('refuses to abort a completed upload', async () => {
      versionsRepository.findUploadById.mockResolvedValue({
        ...uploading,
        status: AssetVersionStatus.UPLOADED,
      });

      await expect(service.abort('version-1')).rejects.toThrow(UploadNotInProgressException);
    });
  });
});
