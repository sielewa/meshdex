import 'reflect-metadata';
import { status } from '@grpc/grpc-js';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { GraphQLSchemaHost } from '@nestjs/graphql';
import { printSchema } from 'graphql';
import { AssetVersionStatus } from '@meshdex/proto/asset/v1';
import { AppModule } from '../src/app.module';
import { FakeAssetServiceServer } from './support/fake-asset-service-server';
import { protoAsset } from './support/proto-asset.fixture';

/**
 * The whole gateway as it runs in production — HTTP, GraphQL schema, validation, per-request
 * DataLoader, resolvers, gRPC client with its service config, error formatting — against a
 * fake asset-service gRPC server.
 */

interface GraphqlResponse {
  data?: Record<string, unknown> | null;
  errors?: {
    message: string;
    locations?: unknown;
    path?: unknown;
    extensions?: { code?: string };
  }[];
}

const ids = ['019a7a5e-8b1c-7c3d-9e4f-000000000001', '019a7a5e-8b1c-7c3d-9e4f-000000000002'];
const missingId = '019a7a5e-8b1c-7c3d-9e4f-0000000000ff';

describe('GraphQL API', () => {
  const fake = new FakeAssetServiceServer();
  let app: INestApplication;
  let baseUrl: string;

  const graphql = async (
    query: string,
    variables: Record<string, unknown> = {},
  ): Promise<GraphqlResponse> => {
    const response = await fetch(`${baseUrl}/graphql`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query,
        variables,
      }),
    });

    return (await response.json()) as GraphqlResponse;
  };

  beforeAll(async () => {
    Object.assign(process.env, {
      HTTP_PORT: '4000',
      CORS_ORIGINS: 'http://localhost:3000',
      GRAPHQL_INTROSPECTION: 'false',
      ASSET_SERVICE_URL: await fake.start(),
      ASSET_SERVICE_READ_TIMEOUT_MS: '2000',
      ASSET_SERVICE_WRITE_TIMEOUT_MS: '2000',
      LOG_LEVEL: 'fatal',
      LOG_PRETTY: 'false',
    });
    // Config namespaces validate the env lazily, when Nest initialises the modules below.
    app = await NestFactory.create(AppModule, {
      logger: false,
      abortOnError: false,
    });
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
    await fake.stop();
  });

  beforeEach(() => {
    fake.reset();
  });

  it('serves the reviewed schema', () => {
    const { schema } = app.get(GraphQLSchemaHost);

    expect(printSchema(schema)).toMatchSnapshot();
  });

  it('batches the asset lookups of one request into a single BatchGetAssets call', async () => {
    fake.respond('batchGetAssets', {
      assets: [protoAsset(ids[0] ?? '', 'Chair'), protoAsset(ids[1] ?? '', 'Table')],
      notFoundAssetIds: [missingId],
    });

    const result = await graphql(
      `
        query ($a: ID!, $b: ID!, $missing: ID!) {
          a: asset(id: $a) {
            id
            status
            createdAt
            currentVersion {
              original {
                sizeBytes
              }
              optimized {
                sizeBytes
              }
            }
          }
          b: asset(id: $b) {
            title
          }
          again: asset(id: $a) {
            title
          }
          missing: asset(id: $missing) {
            id
          }
        }
      `,
      {
        a: ids[0],
        b: ids[1],
        missing: missingId,
      },
    );

    expect(result.errors).toBeUndefined();
    expect(fake.requests('batchGetAssets')).toEqual([
      {
        assetIds: [ids[0], ids[1], missingId],
      },
    ]);
    expect(result.data).toEqual({
      a: {
        id: ids[0],
        status: 'UPLOADED',
        createdAt: '2026-11-12T09:00:00.123Z',
        currentVersion: {
          original: { sizeBytes: 5_000_000_000 },
          optimized: null,
        },
      },
      b: { title: 'Table' },
      again: { title: 'Chair' },
      missing: null,
    });
  });

  it('returns a connection whose endCursor is the next page token', async () => {
    fake.respond('listAssets', {
      assets: [protoAsset(ids[0] ?? '')],
      nextPageToken: 'opaque-token',
    });

    const result = await graphql(`
      {
        assets(first: 1, statuses: [READY], tag: "chair") {
          nodes {
            id
          }
          pageInfo {
            endCursor
            hasNextPage
          }
        }
      }
    `);

    expect(result.data).toEqual({
      assets: {
        nodes: [{ id: ids[0] }],
        pageInfo: {
          endCursor: 'opaque-token',
          hasNextPage: true,
        },
      },
    });
    expect(fake.requests('listAssets')).toEqual([
      {
        pageSize: 1,
        pageToken: '',
        statuses: [AssetVersionStatus.ASSET_VERSION_STATUS_READY],
        tag: 'chair',
      },
    ]);
  });

  it('rejects invalid arguments with BAD_USER_INPUT before calling asset-service', async () => {
    const tooMany = await graphql('{ assets(first: 1000) { nodes { id } } }');
    const notUuid = await graphql('{ asset(id: "42") { id } }');

    expect(tooMany.errors?.[0]).toMatchObject({
      message: 'first must not be greater than 100',
      extensions: { code: 'BAD_USER_INPUT' },
    });
    expect(notUuid.errors?.[0]).toMatchObject({
      message: 'id must be a UUID',
      extensions: { code: 'BAD_USER_INPUT' },
    });
    expect(fake.handler('listAssets')).not.toHaveBeenCalled();
    expect(fake.handler('batchGetAssets')).not.toHaveBeenCalled();
  });

  it('maps gRPC failures to extensions.code with the server message', async () => {
    fake.fail('completeUpload', status.FAILED_PRECONDITION, 'Upload is not in progress');
    fake.fail('listAssets', status.INVALID_ARGUMENT, 'Invalid page token');

    const conflict = await graphql(
      `
        mutation ($id: ID!) {
          completeUpload(input: { assetVersionId: $id, parts: [{ partNumber: 1, etag: "e1" }] }) {
            id
          }
        }
      `,
      { id: ids[0] },
    );
    const badCursor = await graphql('{ assets(after: "garbage") { nodes { id } } }');

    expect(conflict.errors?.[0]).toMatchObject({
      message: 'Upload is not in progress',
      extensions: { code: 'CONFLICT' },
    });
    expect(badCursor.errors?.[0]).toMatchObject({
      message: 'Invalid page token',
      extensions: { code: 'BAD_USER_INPUT' },
    });
  });

  it('masks unexpected errors and hides their message', async () => {
    fake.fail('listAssets', status.INTERNAL, 'relation "assets" does not exist');

    const result = await graphql('{ assets { nodes { id } } }');

    expect(result.errors).toEqual([
      {
        message: 'Internal server error',
        locations: [
          {
            line: 1,
            column: 3,
          },
        ],
        path: ['assets'],
        extensions: { code: 'INTERNAL_SERVER_ERROR' },
      },
    ]);
  });

  it('passes upload input through and returns presigned part URLs', async () => {
    fake.respond('initiateUpload', {
      assetId: ids[0],
      assetVersionId: ids[1],
      partSizeBytes: 16_777_216,
      parts: [
        {
          partNumber: 1,
          url: 'http://localhost:8333/meshdex-assets/part-1',
          expiresAt: {
            seconds: 1_794_477_600,
            nanos: 0,
          },
        },
      ],
    });

    const result = await graphql(
      `
        mutation ($input: InitiateUploadInput!) {
          initiateUpload(input: $input) {
            assetId
            partSizeBytes
            parts {
              partNumber
              expiresAt
            }
          }
        }
      `,
      {
        input: {
          title: 'Chair',
          fileName: 'chair.glb',
          contentType: 'model/gltf-binary',
          sizeBytes: 20_000_000,
        },
      },
    );

    expect(result.data).toEqual({
      initiateUpload: {
        assetId: ids[0],
        partSizeBytes: 16_777_216,
        parts: [
          {
            partNumber: 1,
            expiresAt: '2026-11-12T10:00:00.000Z',
          },
        ],
      },
    });
    expect(fake.requests('initiateUpload')).toEqual([
      {
        title: 'Chair',
        tags: [],
        fileName: 'chair.glb',
        contentType: 'model/gltf-binary',
        sizeBytes: 20_000_000,
      },
    ]);
  });

  it('answers the Kubernetes probes', async () => {
    const live = await fetch(`${baseUrl}/health/live`);
    const ready = await fetch(`${baseUrl}/health/ready`);

    expect(live.status).toBe(200);
    expect(ready.status).toBe(200);
  });
});
