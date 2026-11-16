import type { AssetServicePort } from '../clients/asset-service/domain/asset-service-port.interface';
import type { OriginalDownloadUrl } from '../clients/asset-service/domain/original-download-url.interface';
import { OriginalDownloadUrlLoaderFactory } from './original-download-url-loader.factory';

const signed = (versionId: string): OriginalDownloadUrl => ({
  versionId,
  url: `http://storage.test/${versionId}?sig`,
  expiresAt: 1,
});

describe('OriginalDownloadUrlLoaderFactory', () => {
  let getOriginalDownloadUrls: jest.Mock<Promise<OriginalDownloadUrl[]>, [readonly string[]]>;
  let factory: OriginalDownloadUrlLoaderFactory;

  beforeEach(() => {
    getOriginalDownloadUrls = jest.fn((ids: readonly string[]) =>
      Promise.resolve(ids.filter((id) => id !== 'pending').map(signed)),
    );
    factory = new OriginalDownloadUrlLoaderFactory({
      getOriginalDownloadUrls,
    } as unknown as AssetServicePort);
  });

  it('answers in key order with null for versions without a stored original', async () => {
    const results = await factory.create().loadMany(['b', 'pending', 'a']);

    expect(results).toEqual([signed('b'), null, signed('a')]);
    expect(getOriginalDownloadUrls).toHaveBeenCalledTimes(1);
  });

  it('splits more than 100 versions into calls within the RPC limit', async () => {
    const ids = Array.from({ length: 130 }, (_, index) => `v-${String(index)}`);

    await factory.create().loadMany(ids);

    expect(getOriginalDownloadUrls.mock.calls.map(([batch]) => batch.length)).toEqual([100, 30]);
  });
});
