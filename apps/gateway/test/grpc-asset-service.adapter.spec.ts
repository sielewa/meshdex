import 'reflect-metadata';
import { status } from '@grpc/grpc-js';
import { ClientGrpcProxy, type GrpcOptions } from '@nestjs/microservices';
import { AssetVersionStatus } from '@meshdex/proto/asset/v1';
import { AssetStatus } from '../src/clients/asset-service/domain/asset-status.enum';
import { AssetServiceUnavailableException } from '../src/clients/asset-service/exceptions/asset-service-unavailable.exception';
import { AssetStateConflictException } from '../src/clients/asset-service/exceptions/asset-state-conflict.exception';
import { ResourceNotFoundException } from '../src/clients/asset-service/exceptions/resource-not-found.exception';
import { AssetServiceClientOptionsFactory } from '../src/clients/asset-service/infrastructure/asset-service-client-options.factory';
import { GrpcAssetServiceAdapter } from '../src/clients/asset-service/infrastructure/grpc-asset-service.adapter';
import { protoAsset } from './support/proto-asset.fixture';
import { ASSET_SERVICE, FakeGrpcServer } from './support/fake-grpc-server';

/**
 * The adapter with the real client options against a real gRPC server: proves that the
 * contract round-trips (camelCase, int64 as number, timestamps, enums) and that the
 * service config really enforces deadlines and retries.
 */

const TIMEOUT_MS = 300;
const assetId = '019a7a5e-8b1c-7c3d-9e4f-000000000001';

describe('GrpcAssetServiceAdapter against a gRPC server', () => {
  const fake = new FakeGrpcServer(ASSET_SERVICE);
  let proxy: ClientGrpcProxy;
  let adapter: GrpcAssetServiceAdapter;

  beforeAll(async () => {
    const url = await fake.start();
    const factory = new AssetServiceClientOptionsFactory({
      url,
      readTimeoutMs: TIMEOUT_MS,
      writeTimeoutMs: TIMEOUT_MS,
    });

    proxy = new ClientGrpcProxy((factory.createClientOptions() as GrpcOptions).options);
    adapter = new GrpcAssetServiceAdapter(proxy);
    adapter.onModuleInit();
  });

  afterAll(async () => {
    proxy.close();
    await fake.stop();
  });

  beforeEach(() => {
    fake.reset();
  });

  it('maps a proto asset to the domain shape', async () => {
    fake.respond('batchGetAssets', {
      assets: [protoAsset(assetId)],
      notFoundAssetIds: [],
    });

    const [asset] = await adapter.batchGetAssets([assetId]);

    expect(asset).toEqual({
      id: assetId,
      title: 'Chair',
      tags: ['furniture'],
      status: AssetStatus.UPLOADED,
      currentVersion: {
        id: `${assetId}-v1`,
        assetId,
        number: 1,
        status: AssetStatus.UPLOADED,
        original: {
          key: `assets/${assetId}/original.glb`,
          sizeBytes: 5_000_000_000,
          contentType: 'model/gltf-binary',
        },
        optimized: null,
        thumbnails: [],
        stats: null,
        failureReason: null,
        createdAt: 1_794_474_000_123,
        processedAt: null,
        sourcePreview: null,
      },
      createdAt: 1_794_474_000_123,
      updatedAt: 1_794_474_300_000,
    });
  });

  it('turns an empty next page token into null and sends filters as proto values', async () => {
    fake.respond('listAssets', {
      assets: [],
      nextPageToken: '',
    });

    const page = await adapter.listAssets({
      pageSize: 5,
      pageToken: null,
      statuses: [AssetStatus.READY],
      tag: 'chair',
    });

    expect(page.nextPageToken).toBeNull();
    expect(fake.requests('listAssets')).toEqual([
      {
        pageSize: 5,
        pageToken: '',
        statuses: [AssetVersionStatus.ASSET_VERSION_STATUS_READY],
        tag: 'chair',
      },
    ]);
  });

  it('enforces the read deadline from the service config', async () => {
    fake.handler('batchGetAssets').mockImplementation((_request, callback) => {
      setTimeout(() => {
        callback(null, { assets: [] });
      }, TIMEOUT_MS * 3);
    });
    const startedAt = Date.now();

    await expect(adapter.batchGetAssets([assetId])).rejects.toBeInstanceOf(
      AssetServiceUnavailableException,
    );
    expect(Date.now() - startedAt).toBeLessThan(TIMEOUT_MS * 2);
  });

  it('retries an idempotent read after UNAVAILABLE', async () => {
    fake
      .handler('batchGetAssets')
      .mockImplementationOnce((_request, callback) => {
        callback({
          code: status.UNAVAILABLE,
          details: 'restarting',
        });
      })
      .mockImplementationOnce((_request, callback) => {
        callback(null, { assets: [protoAsset(assetId)] });
      });

    const assets = await adapter.batchGetAssets([assetId]);

    expect(assets).toHaveLength(1);
    expect(fake.handler('batchGetAssets')).toHaveBeenCalledTimes(2);
  });

  it('retries CompleteUpload, which asset-service makes idempotent', async () => {
    fake
      .handler('completeUpload')
      .mockImplementationOnce((_request, callback) => {
        callback({
          code: status.UNAVAILABLE,
          details: 'restarting',
        });
      })
      .mockImplementationOnce((_request, callback) => {
        callback(null, { asset: protoAsset(assetId) });
      });

    await expect(adapter.completeUpload(assetId, [])).resolves.toMatchObject({ id: assetId });
    expect(fake.handler('completeUpload')).toHaveBeenCalledTimes(2);
  });

  it('does not retry InitiateUpload, whose repeat would create a second asset', async () => {
    fake.fail('initiateUpload', status.UNAVAILABLE, 'restarting');

    await expect(
      adapter.initiateUpload({
        title: 'Chair',
        tags: [],
        fileName: 'chair.glb',
        contentType: 'model/gltf-binary',
        sizeBytes: 1,
      }),
    ).rejects.toBeInstanceOf(AssetServiceUnavailableException);
    expect(fake.handler('initiateUpload')).toHaveBeenCalledTimes(1);
  });

  it('maps NOT_FOUND and FAILED_PRECONDITION to domain exceptions with the server message', async () => {
    fake.fail('completeUpload', status.NOT_FOUND, 'Asset version not found');
    await expect(adapter.completeUpload(assetId, [])).rejects.toEqual(
      new ResourceNotFoundException('Asset version not found'),
    );

    fake.fail('completeUpload', status.FAILED_PRECONDITION, 'Upload is not in progress');
    await expect(adapter.completeUpload(assetId, [])).rejects.toEqual(
      new AssetStateConflictException('Upload is not in progress'),
    );
  });

  it('maps download URLs and their expiry', async () => {
    fake.respond('getOriginalDownloadUrls', {
      urls: [
        {
          assetVersionId: `${assetId}-v1`,
          url: 'http://storage.test/original.glb?sig',
          expiresAt: {
            seconds: 1_794_475_800,
            nanos: 0,
          },
        },
      ],
    });

    await expect(adapter.getOriginalDownloadUrls([`${assetId}-v1`])).resolves.toEqual([
      {
        versionId: `${assetId}-v1`,
        url: 'http://storage.test/original.glb?sig',
        expiresAt: 1_794_475_800_000,
      },
    ]);
    expect(fake.requests('getOriginalDownloadUrls')).toEqual([
      { assetVersionIds: [`${assetId}-v1`] },
    ]);
  });

  it('rethrows unexpected gRPC codes unchanged', async () => {
    fake.fail('listAssets', status.INTERNAL, 'relation "assets" does not exist');

    await expect(
      adapter.listAssets({
        pageSize: 1,
        pageToken: null,
        statuses: [],
        tag: null,
      }),
    ).rejects.toMatchObject({ code: status.INTERNAL });
  });
});
