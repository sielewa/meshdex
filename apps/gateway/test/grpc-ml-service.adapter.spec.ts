import 'reflect-metadata';
import { status } from '@grpc/grpc-js';
import { ClientGrpcProxy, type GrpcOptions } from '@nestjs/microservices';
import { InvalidSearchRequestException } from '../src/clients/ml-service/exceptions/invalid-search-request.exception';
import { MlServiceUnavailableException } from '../src/clients/ml-service/exceptions/ml-service-unavailable.exception';
import { GrpcMlServiceAdapter } from '../src/clients/ml-service/infrastructure/grpc-ml-service.adapter';
import { MlServiceClientOptionsFactory } from '../src/clients/ml-service/infrastructure/ml-service-client-options.factory';
import { EMBEDDING_SERVICE, FakeGrpcServer } from './support/fake-grpc-server';

/**
 * The adapter with the real client options against a real gRPC server: the contract
 * round-trips and the service config enforces the search deadline and retry policy.
 */

const TIMEOUT_MS = 300;
const assetIds = ['019a7a5e-8b1c-7c3d-9e4f-000000000001', '019a7a5e-8b1c-7c3d-9e4f-000000000002'];

describe('GrpcMlServiceAdapter against a gRPC server', () => {
  const fake = new FakeGrpcServer(EMBEDDING_SERVICE);
  let proxy: ClientGrpcProxy;
  let adapter: GrpcMlServiceAdapter;

  beforeAll(async () => {
    const url = await fake.start();
    const factory = new MlServiceClientOptionsFactory({
      url,
      searchTimeoutMs: TIMEOUT_MS,
    });

    proxy = new ClientGrpcProxy((factory.createClientOptions() as GrpcOptions).options);
    adapter = new GrpcMlServiceAdapter(proxy);
    adapter.onModuleInit();
  });

  afterAll(async () => {
    proxy.close();
    await fake.stop();
  });

  beforeEach(() => {
    fake.reset();
  });

  it('sends the query and limit and maps the ranked hits', async () => {
    fake.respond('searchAssets', {
      hits: [
        { assetId: assetIds[0], score: 0.31 },
        { assetId: assetIds[1], score: 0.29 },
      ],
      model: 'ViT-B-32/laion2b_s34b_b79k',
    });

    const result = await adapter.searchAssets('wooden chair', 2);

    expect(fake.requests('searchAssets')).toEqual([{ query: 'wooden chair', limit: 2 }]);
    expect(result.model).toBe('ViT-B-32/laion2b_s34b_b79k');
    expect(result.hits.map((hit) => hit.assetId)).toEqual(assetIds);
    // float on the wire: compared with float32 precision.
    expect(result.hits[0]?.score).toBeCloseTo(0.31, 5);
  });

  it('maps INVALID_ARGUMENT to a domain exception with the server message', async () => {
    fake.fail('searchAssets', status.INVALID_ARGUMENT, 'query must not be empty');

    await expect(adapter.searchAssets(' ', 10)).rejects.toThrow(
      new InvalidSearchRequestException('query must not be empty'),
    );
  });

  it('enforces the search deadline from the service config', async () => {
    fake.handler('searchAssets').mockImplementation((_request, callback) => {
      setTimeout(() => {
        callback(null, { hits: [], model: 'm' });
      }, TIMEOUT_MS * 3);
    });
    const startedAt = Date.now();

    await expect(adapter.searchAssets('chair', 10)).rejects.toBeInstanceOf(
      MlServiceUnavailableException,
    );
    expect(Date.now() - startedAt).toBeLessThan(TIMEOUT_MS * 2);
  });

  it('retries after UNAVAILABLE', async () => {
    fake
      .handler('searchAssets')
      .mockImplementationOnce((_request, callback) => {
        callback({
          code: status.UNAVAILABLE,
          details: 'restarting',
        });
      })
      .mockImplementationOnce((_request, callback) => {
        callback(null, { hits: [], model: 'm' });
      });

    await expect(adapter.searchAssets('chair', 10)).resolves.toEqual({ hits: [], model: 'm' });
    expect(fake.handler('searchAssets')).toHaveBeenCalledTimes(2);
  });

  it('does not retry RESOURCE_EXHAUSTED, which a busy ml-service answers', async () => {
    fake.fail('searchAssets', status.RESOURCE_EXHAUSTED, 'Concurrent RPC limit exceeded');

    await expect(adapter.searchAssets('chair', 10)).rejects.toBeInstanceOf(
      MlServiceUnavailableException,
    );
    expect(fake.handler('searchAssets')).toHaveBeenCalledTimes(1);
  });

  it('rethrows unexpected gRPC codes unchanged', async () => {
    fake.fail('searchAssets', status.INTERNAL, 'boom');

    await expect(adapter.searchAssets('chair', 10)).rejects.toMatchObject({
      code: status.INTERNAL,
    });
  });
});
