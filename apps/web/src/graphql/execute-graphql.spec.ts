import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeGraphql } from '@/graphql/execute-graphql';
import { TypedDocumentString } from '@/graphql/gql/graphql';
import { GraphqlRequestError } from '@/graphql/graphql-request-error';

const document = new TypedDocumentString<{ ping: string }, { id: string }>(
  'query Ping($id: ID!) { ping(id: $id) }',
);
const endpoint = 'http://gateway.test/graphql';

const respond = (status: number, body: unknown): void => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        new Response(typeof body === 'string' ? body : JSON.stringify(body), { status }),
      ),
    ),
  );
};

describe('executeGraphql', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts the operation with its variables and returns data', async () => {
    respond(200, { data: { ping: 'pong' } });

    const result = await executeGraphql({
      endpoint,
      document,
      variables: { id: '1' },
    });

    expect(result).toEqual({ ping: 'pong' });
    const [url, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(url).toBe(endpoint);
    expect(JSON.parse(typeof init?.body === 'string' ? init.body : '')).toEqual({
      query: 'query Ping($id: ID!) { ping(id: $id) }',
      variables: { id: '1' },
    });
  });

  it('fails with the extensions.code of every returned error', async () => {
    respond(200, {
      data: null,
      errors: [
        { message: 'asset-service is unavailable', extensions: { code: 'SERVICE_UNAVAILABLE' } },
      ],
    });

    const call = executeGraphql({
      endpoint,
      document,
      variables: { id: '1' },
    });

    await expect(call).rejects.toBeInstanceOf(GraphqlRequestError);
    await expect(call).rejects.toMatchObject({
      message: 'asset-service is unavailable',
      codes: ['SERVICE_UNAVAILABLE'],
    });
  });

  it('reports a non-GraphQL response with its HTTP status', async () => {
    respond(502, '<html>Bad Gateway</html>');

    await expect(
      executeGraphql({
        endpoint,
        document,
        variables: { id: '1' },
      }),
    ).rejects.toMatchObject({
      codes: [],
      httpStatus: 502,
    });
  });
});
