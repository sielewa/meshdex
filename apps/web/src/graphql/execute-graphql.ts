import type { TypedDocumentString } from '@/graphql/gql/graphql';
import { GraphqlRequestError } from '@/graphql/graphql-request-error';

interface GraphqlResponseBody<TResult> {
  data?: TResult | null;
  errors?: { message: string; extensions?: { code?: unknown } }[];
}

/**
 * Sends one typed operation to the gateway. Server components pass the internal endpoint,
 * client components the public one (`useGatewayEndpoint`); the document carries both the
 * result and the variables type, so a call can't drift from the schema.
 *
 * Any error in the response fails the whole call: the views in this app need complete
 * data, and partial results would have to be handled field by field.
 */
export async function executeGraphql<TResult, TVariables>(options: {
  endpoint: string;
  document: TypedDocumentString<TResult, TVariables>;
  variables: TVariables;
  /** Lets TanStack Query cancel requests whose result nobody needs anymore. */
  signal?: AbortSignal;
}): Promise<TResult> {
  const response = await fetch(options.endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/graphql-response+json, application/json',
    },
    body: JSON.stringify({
      query: options.document.toString(),
      variables: options.variables,
    }),
    signal: options.signal,
    // Asset data changes with uploads and processing; caching is TanStack Query's job.
    cache: 'no-store',
  });
  const body = await readBody<TResult>(response);

  if (!body) {
    throw new GraphqlRequestError(
      `Gateway responded with HTTP ${String(response.status)}`,
      [],
      response.status,
    );
  }

  if (body.errors && body.errors.length > 0) {
    const codes = body.errors.map((error) =>
      typeof error.extensions?.code === 'string' ? error.extensions.code : 'UNKNOWN',
    );

    throw new GraphqlRequestError(
      body.errors.map((error) => error.message).join('; '),
      codes,
      response.status,
    );
  }

  if (body.data === undefined || body.data === null) {
    throw new GraphqlRequestError('Gateway returned no data', [], response.status);
  }

  return body.data;
}

/** `null` when the response is not a GraphQL JSON body (proxy error page, crash, …). */
async function readBody<TResult>(response: Response): Promise<GraphqlResponseBody<TResult> | null> {
  try {
    const body: unknown = await response.json();

    return typeof body === 'object' && body !== null ? body : null;
  } catch {
    return null;
  }
}
