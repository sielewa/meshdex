import { status } from '@grpc/grpc-js';
import { RpcException } from '@nestjs/microservices';
import type { ListAssetsRequest } from '@meshdex/proto/asset/v1';
import { AssetProtoMapper } from './asset-proto.mapper';
import { CatalogController } from './catalog.controller';
import type { CatalogService } from './catalog.service';

const request = (pageToken: string): ListAssetsRequest => ({
  pageSize: 1,
  pageToken,
  statuses: [],
  tag: '',
});

describe('CatalogController page tokens', () => {
  let catalog: { list: jest.Mock };
  let controller: CatalogController;

  beforeEach(() => {
    catalog = { list: jest.fn() };
    controller = new CatalogController(
      catalog as unknown as CatalogService,
      new AssetProtoMapper(),
    );
  });

  it('hands out an opaque token that leads back to the same position', async () => {
    const position = {
      createdAt: 1_762_900_000_123,
      id: '01a1ccfe-8306-77fa-96b3-298b2d7a4dd0',
    };
    catalog.list.mockResolvedValueOnce({
      assets: [],
      next: position,
    });

    const { nextPageToken } = await controller.listAssets(request(''));

    expect(nextPageToken).not.toContain(position.id);
    expect(catalog.list).toHaveBeenLastCalledWith(expect.objectContaining({ after: null }));

    catalog.list.mockResolvedValueOnce({
      assets: [],
      next: null,
    });
    const lastPage = await controller.listAssets(request(nextPageToken));

    expect(catalog.list).toHaveBeenLastCalledWith(expect.objectContaining({ after: position }));
    expect(lastPage.nextPageToken).toBe('');
  });

  it('rejects malformed or forged tokens with INVALID_ARGUMENT', async () => {
    const wrongShape = Buffer.from('{"c":"x","i":1}').toString('base64url');
    // Right shape, but an id the keyset query would compare against the uuid column.
    const forgedId = Buffer.from('{"c":1,"i":"x"}').toString('base64url');

    for (const token of ['garbage', wrongShape, forgedId]) {
      const rejection = controller.listAssets(request(token));

      await expect(rejection).rejects.toBeInstanceOf(RpcException);
      await expect(rejection).rejects.toMatchObject({
        error: { code: status.INVALID_ARGUMENT },
      });
    }
    expect(catalog.list).not.toHaveBeenCalled();
  });
});
