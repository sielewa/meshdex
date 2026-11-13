import 'reflect-metadata';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { status } from '@grpc/grpc-js';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { GraphQLSchemaHost } from '@nestjs/graphql';
import { printSchema } from 'graphql';
import { AssetVersionStatus } from '@meshdex/proto/asset/v1';
import { AppModule } from '../src/app.module';
import { ASSET_SERVICE, EMBEDDING_SERVICE, FakeGrpcServer } from './support/fake-grpc-server';
import { protoAsset } from './support/proto-asset.fixture';

/**
 * The whole gateway as it runs in production — HTTP, GraphQL schema, validation, per-request
 * DataLoader, resolvers, gRPC clients with their service configs, error formatting — against
 * fake asset-service and ml-service gRPC servers.
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
const SCHEMA_FILE_HEADER = [
  "# Generated from the gateway's code-first schema (ADR 011). Do not edit by hand.",
  '# Regenerate: UPDATE_SCHEMA=true pnpm --filter @meshdex/gateway test -- graphql-api',
  '',
  '',
].join('\n');

describe('GraphQL API', () => {
  const fake = new FakeGrpcServer(ASSET_SERVICE);
  const ml = new FakeGrpcServer(EMBEDDING_SERVICE);
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
      ML_SERVICE_URL: await ml.start(),
      ML_SERVICE_SEARCH_TIMEOUT_MS: '2000',
      MEDIA_BASE_URL: 'http://media.test/bucket/',
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
    await ml.stop();
  });

  beforeEach(() => {
    fake.reset();
    ml.reset();
  });

  /**
   * `schema.graphql` is the contract artifact the web app generates its types from
   * (ADR 011). The test fails when the code-first schema and the file disagree, so a
   * contract change can't be merged without the file — and its diff — changing too.
   * Regenerate with `UPDATE_SCHEMA=true pnpm --filter @meshdex/gateway test -- graphql-api`.
   */
  it('serves exactly the schema committed in schema.graphql', () => {
    const { schema } = app.get(GraphQLSchemaHost);
    const schemaFile = join(__dirname, '..', 'schema.graphql');
    const printed = `${SCHEMA_FILE_HEADER}${printSchema(schema)}\n`;

    if (process.env.UPDATE_SCHEMA === 'true') {
      writeFileSync(schemaFile, printed);
    }

    expect(readFileSync(schemaFile, 'utf8')).toBe(printed);
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

  it('searches in ml-service and loads the hits in rank order with one BatchGetAssets', async () => {
    ml.respond('searchAssets', {
      hits: [
        { assetId: ids[1], score: 0.5 },
        { assetId: missingId, score: 0.4 },
        { assetId: ids[0], score: 0.25 },
      ],
      model: 'ViT-B-32/laion2b_s34b_b79k',
    });
    fake.respond('batchGetAssets', {
      assets: [protoAsset(ids[1] ?? '', 'Table'), protoAsset(ids[0] ?? '', 'Chair')],
      notFoundAssetIds: [missingId],
    });

    const result = await graphql(`
      {
        searchAssets(query: "wooden furniture", first: 3) {
          model
          hits {
            score
            asset {
              id
              title
            }
          }
        }
      }
    `);

    expect(result.errors).toBeUndefined();
    expect(ml.requests('searchAssets')).toEqual([{ query: 'wooden furniture', limit: 3 }]);
    expect(fake.requests('batchGetAssets')).toEqual([{ assetIds: [ids[1], missingId, ids[0]] }]);
    // The asset deleted since it was embedded is left out; the ranking is kept.
    expect(result.data).toEqual({
      searchAssets: {
        model: 'ViT-B-32/laion2b_s34b_b79k',
        hits: [
          { score: 0.5, asset: { id: ids[1], title: 'Table' } },
          { score: 0.25, asset: { id: ids[0], title: 'Chair' } },
        ],
      },
    });
  });

  it('asks ml-service for 20 hits by default and skips asset-service when there are none', async () => {
    ml.respond('searchAssets', { hits: [], model: 'm' });

    const result = await graphql('{ searchAssets(query: "spaceship") { hits { score } } }');

    expect(result.data).toEqual({ searchAssets: { hits: [] } });
    expect(ml.requests('searchAssets')).toEqual([{ query: 'spaceship', limit: 20 }]);
    expect(fake.handler('batchGetAssets')).not.toHaveBeenCalled();
  });

  it('rejects oversized searches before calling ml-service', async () => {
    const tooMany = await graphql('{ searchAssets(query: "chair", first: 101) { model } }');
    const tooLong = await graphql('query ($q: String!) { searchAssets(query: $q) { model } }', {
      q: 'x'.repeat(501),
    });

    expect(tooMany.errors?.[0]).toMatchObject({
      message: 'first must not be greater than 100',
      extensions: { code: 'BAD_USER_INPUT' },
    });
    expect(tooLong.errors?.[0]).toMatchObject({
      message: 'query must be shorter than or equal to 500 characters',
      extensions: { code: 'BAD_USER_INPUT' },
    });
    expect(ml.handler('searchAssets')).not.toHaveBeenCalled();
  });

  it('maps ml-service failures to BAD_USER_INPUT and SERVICE_UNAVAILABLE', async () => {
    ml.fail('searchAssets', status.INVALID_ARGUMENT, 'query must not be empty');
    const blank = await graphql('{ searchAssets(query: "   ") { model } }');

    ml.fail('searchAssets', status.UNAVAILABLE, 'connection refused');
    const down = await graphql('{ searchAssets(query: "chair") { model } }');

    expect(blank.errors?.[0]).toMatchObject({
      message: 'query must not be empty',
      extensions: { code: 'BAD_USER_INPUT' },
    });
    expect(down.errors?.[0]).toMatchObject({
      message: 'ml-service is unavailable',
      extensions: { code: 'SERVICE_UNAVAILABLE' },
    });
  });

  it('gives public files a stable media URL and private files none (ADR 010, 017)', async () => {
    const asset = protoAsset(ids[0] ?? '', 'Alarm clock');

    if (asset.currentVersion) {
      asset.currentVersion.sourcePreview = {
        key: `public/previews/${asset.id}/v1.webp`,
        sizeBytes: 150_000,
        contentType: 'image/webp',
      };
    }

    fake.respond('batchGetAssets', {
      assets: [asset],
      notFoundAssetIds: [],
    });

    const result = await graphql(
      `
        query ($id: ID!) {
          asset(id: $id) {
            currentVersion {
              original {
                url
              }
              sourcePreview {
                url
                contentType
              }
            }
          }
        }
      `,
      { id: ids[0] },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      asset: {
        currentVersion: {
          original: { url: null },
          sourcePreview: {
            url: `http://media.test/bucket/public/previews/${asset.id}/v1.webp`,
            contentType: 'image/webp',
          },
        },
      },
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

  it('signs download URLs only when selected, batching all versions of a request', async () => {
    fake.respond('batchGetAssets', {
      assets: [protoAsset(ids[0] ?? '', 'Chair'), protoAsset(ids[1] ?? '', 'Table')],
    });
    fake.respond('getOriginalDownloadUrls', {
      urls: [
        {
          assetVersionId: `${ids[0] ?? ''}-v1`,
          url: 'http://localhost:8333/meshdex-assets/originals/chair.glb?X-Amz-Signature=abc',
          expiresAt: {
            seconds: 1_794_475_800,
            nanos: 0,
          },
        },
      ],
    });

    const result = await graphql(
      `
        query ($a: ID!, $b: ID!) {
          a: asset(id: $a) {
            currentVersion {
              originalDownloadUrl {
                url
                expiresAt
              }
            }
          }
          b: asset(id: $b) {
            currentVersion {
              originalDownloadUrl {
                url
              }
            }
          }
        }
      `,
      {
        a: ids[0],
        b: ids[1],
      },
    );

    expect(result.errors).toBeUndefined();
    expect(result.data).toEqual({
      a: {
        currentVersion: {
          originalDownloadUrl: {
            url: 'http://localhost:8333/meshdex-assets/originals/chair.glb?X-Amz-Signature=abc',
            expiresAt: '2026-11-12T09:30:00.000Z',
          },
        },
      },
      b: { currentVersion: { originalDownloadUrl: null } },
    });
    expect(fake.requests('getOriginalDownloadUrls')).toEqual([
      {
        assetVersionIds: [`${ids[0] ?? ''}-v1`, `${ids[1] ?? ''}-v1`],
      },
    ]);

    fake.respond('listAssets', {
      assets: [protoAsset(ids[0] ?? '')],
      nextPageToken: '',
    });
    await graphql('{ assets { nodes { currentVersion { number } } } }');

    expect(fake.handler('getOriginalDownloadUrls')).toHaveBeenCalledTimes(1);
  });

  it('keeps the asset when only its download URL fails', async () => {
    fake.respond('batchGetAssets', { assets: [protoAsset(ids[0] ?? '', 'Chair')] });
    fake.fail('getOriginalDownloadUrls', status.UNAVAILABLE, 'restarting');

    const result = await graphql(
      '{ asset(id: "' +
        (ids[0] ?? '') +
        '") { title currentVersion { originalDownloadUrl { url } } } }',
    );

    expect(result.data).toEqual({
      asset: {
        title: 'Chair',
        currentVersion: { originalDownloadUrl: null },
      },
    });
    expect(result.errors?.[0]).toMatchObject({
      path: ['asset', 'currentVersion', 'originalDownloadUrl'],
      extensions: { code: 'SERVICE_UNAVAILABLE' },
    });
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
        // Unset message field as the server decodes it: browser uploads send no preview (ADR 017).
        sourcePreview: null,
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
