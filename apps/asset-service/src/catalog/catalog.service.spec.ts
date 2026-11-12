import type { Asset } from '../assets/domain/asset.interface';
import { AssetVersionStatus } from '../assets/domain/asset-version-status.enum';
import { CatalogService } from './catalog.service';
import { AssetNotFoundException } from './exceptions/asset-not-found.exception';
import { InvalidCatalogRequestException } from './exceptions/invalid-catalog-request.exception';
import type { AssetListRepository } from './infrastructure/asset-list.repository';
import type { AssetViewsRepository } from './infrastructure/asset-views.repository';

const asset = (id: string): Asset => ({ id }) as Asset;

describe('CatalogService', () => {
  let views: { findByIds: jest.Mock; findVersionById: jest.Mock };
  let list: { findPage: jest.Mock };
  let service: CatalogService;

  beforeEach(() => {
    views = {
      findByIds: jest.fn((ids: string[]) =>
        Promise.resolve(
          ids
            .filter((id) => id !== 'missing')
            .reverse()
            .map(asset),
        ),
      ),
      findVersionById: jest.fn().mockResolvedValue(null),
    };
    list = { findPage: jest.fn() };
    service = new CatalogService(
      views as unknown as AssetViewsRepository,
      list as unknown as AssetListRepository,
    );
  });

  it('returns batch results in request order and reports missing ids', async () => {
    const result = await service.batchGet(['b', 'missing', 'a', 'b']);

    expect(result.assets.map((found) => found.id)).toEqual(['b', 'a']);
    expect(result.notFoundIds).toEqual(['missing']);
    expect(views.findByIds).toHaveBeenCalledWith(['b', 'missing', 'a']);
  });

  it('caps the number of ids per batch call', async () => {
    const ids = Array.from({ length: 101 }, (_, index) => String(index));

    await expect(service.batchGet(ids)).rejects.toThrow(InvalidCatalogRequestException);
  });

  it('throws NotFound for a single missing asset', async () => {
    await expect(service.getAsset('missing')).rejects.toThrow(AssetNotFoundException);
  });

  it('fetches one extra row to decide whether there is a next page', async () => {
    list.findPage.mockResolvedValue([
      {
        id: 'c',
        createdAt: 3,
      },
      {
        id: 'b',
        createdAt: 2,
      },
      {
        id: 'a',
        createdAt: 1,
      },
    ]);

    const page = await service.list({
      pageSize: 2,
      after: null,
      statuses: [],
      tag: '',
    });

    expect(list.findPage).toHaveBeenCalledWith(
      {
        statuses: [],
        tag: null,
      },
      null,
      3,
    );
    expect(page.assets.map((found) => found.id)).toEqual(['c', 'b']);
    expect(page.next).toEqual({
      id: 'b',
      createdAt: 2,
    });
  });

  it('continues after the cursor and reports the last page', async () => {
    list.findPage.mockResolvedValue([
      {
        id: 'a',
        createdAt: 1,
      },
    ]);

    const page = await service.list({
      pageSize: 2,
      after: {
        id: 'b',
        createdAt: 2,
      },
      statuses: [AssetVersionStatus.READY],
      tag: ' Chair ',
    });

    expect(list.findPage).toHaveBeenCalledWith(
      {
        statuses: [AssetVersionStatus.READY],
        tag: 'chair',
      },
      {
        id: 'b',
        createdAt: 2,
      },
      3,
    );
    expect(page.next).toBeNull();
  });

  it('rejects page sizes above the maximum', async () => {
    await expect(
      service.list({
        pageSize: 101,
        after: null,
        statuses: [],
        tag: '',
      }),
    ).rejects.toThrow(InvalidCatalogRequestException);
  });
});
