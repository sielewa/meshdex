import type { ObjectStorage } from '../storage/domain/object-storage-port.interface';
import { DownloadsService } from './downloads.service';
import { InvalidDownloadRequestException } from './exceptions/invalid-download-request.exception';
import type { StoredOriginalsRepository } from './infrastructure/stored-originals.repository';

const STORED = '019a7a5e-8b1c-7c3d-9e4f-0000000000a1';
const ALSO_STORED = '019a7a5e-8b1c-7c3d-9e4f-0000000000a2';
const PENDING = '019a7a5e-8b1c-7c3d-9e4f-0000000000ff';
const NOW = Date.UTC(2026, 10, 12, 9, 0, 0);
const TTL_SECONDS = 900;

describe('DownloadsService', () => {
  let originals: { findAllByVersionIds: jest.Mock };
  let storage: { presignDownload: jest.Mock };
  let service: DownloadsService;

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    originals = {
      findAllByVersionIds: jest.fn().mockResolvedValue([
        {
          versionId: ALSO_STORED,
          originalKey: `originals/a/${ALSO_STORED}.glb`,
        },
        {
          versionId: STORED,
          originalKey: `originals/a/${STORED}.glb`,
        },
      ]),
    };
    storage = {
      presignDownload: jest.fn((key: string) => Promise.resolve(`https://storage.test/${key}?sig`)),
    };
    service = new DownloadsService(
      originals as unknown as StoredOriginalsRepository,
      storage as unknown as ObjectStorage,
      { urlTtlSeconds: TTL_SECONDS },
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('signs stored originals in request order and leaves out versions without one', async () => {
    const urls = await service.getOriginalDownloadUrls([STORED, PENDING, ALSO_STORED, STORED]);

    expect(urls).toEqual([
      {
        versionId: STORED,
        url: `https://storage.test/originals/a/${STORED}.glb?sig`,
        expiresAt: NOW + TTL_SECONDS * 1000,
      },
      {
        versionId: ALSO_STORED,
        url: `https://storage.test/originals/a/${ALSO_STORED}.glb?sig`,
        expiresAt: NOW + TTL_SECONDS * 1000,
      },
    ]);
    expect(originals.findAllByVersionIds).toHaveBeenCalledWith([STORED, PENDING, ALSO_STORED]);
    expect(storage.presignDownload).toHaveBeenCalledWith(`originals/a/${STORED}.glb`, TTL_SECONDS);
  });

  it('rejects malformed ids and oversized batches before touching the database', async () => {
    const tooMany = Array.from(
      { length: 101 },
      (_, index) => `019a7a5e-8b1c-7c3d-9e4f-${String(index).padStart(12, '0')}`,
    );

    await expect(service.getOriginalDownloadUrls([STORED, '42'])).rejects.toThrow(
      'Asset version ids are not UUIDs: 42',
    );
    await expect(service.getOriginalDownloadUrls(tooMany)).rejects.toThrow(
      InvalidDownloadRequestException,
    );
    expect(originals.findAllByVersionIds).not.toHaveBeenCalled();
  });

  it('returns nothing for an empty request', async () => {
    originals.findAllByVersionIds.mockResolvedValue([]);

    await expect(service.getOriginalDownloadUrls([])).resolves.toEqual([]);
    expect(storage.presignDownload).not.toHaveBeenCalled();
  });
});
