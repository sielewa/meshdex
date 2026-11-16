import type { Asset } from '../clients/asset-service/domain/asset.interface';
import type { AssetServicePort } from '../clients/asset-service/domain/asset-service-port.interface';
import { AssetLoaderFactory } from './asset-loader.factory';

const assetWithId = (id: string): Asset => ({ id }) as unknown as Asset;

describe('AssetLoaderFactory', () => {
  let batchGetAssets: jest.Mock<Promise<Asset[]>, [readonly string[]]>;
  let factory: AssetLoaderFactory;

  beforeEach(() => {
    batchGetAssets = jest.fn((ids: readonly string[]) =>
      Promise.resolve(ids.filter((id) => id !== 'missing').map(assetWithId)),
    );
    factory = new AssetLoaderFactory({ batchGetAssets } as unknown as AssetServicePort);
  });

  it('answers in key order and resolves missing ids to null', async () => {
    batchGetAssets.mockResolvedValueOnce([assetWithId('b'), assetWithId('a')]);
    const loader = factory.create();

    const results = await loader.loadMany(['a', 'missing', 'b']);

    expect(results).toEqual([assetWithId('a'), null, assetWithId('b')]);
  });

  it('splits more than 100 ids into calls within the BatchGetAssets limit', async () => {
    const loader = factory.create();
    const ids = Array.from({ length: 150 }, (_, index) => `id-${String(index)}`);

    await loader.loadMany(ids);

    expect(batchGetAssets.mock.calls.map(([batch]) => batch.length)).toEqual([100, 50]);
  });

  it('gives every request its own cache', async () => {
    await factory.create().load('a');
    await factory.create().load('a');

    expect(batchGetAssets).toHaveBeenCalledTimes(2);
  });
});
