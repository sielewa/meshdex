import { defaultShouldDehydrateQuery, QueryClient } from '@tanstack/react-query';
import { GraphqlRequestError } from '@/graphql/graphql-request-error';
import { RETRYABLE_ERROR_CODES } from '@/graphql/graphql.constants';

const MAX_RETRIES = 2;

/**
 * One QueryClient per server request (`getServerQueryClient`) and one per browser tab
 * (`Providers`). Server-prefetched queries are dehydrated into the HTML and picked up by
 * the browser's client without a second request.
 */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Data rendered on the server counts as fresh for a while, so the browser doesn't
        // refetch it right after hydration.
        staleTime: 30_000,
        retry: (failureCount, error) => failureCount < MAX_RETRIES && isRetryable(error),
      },
      dehydrate: {
        // Also hand over queries still in flight, so a server component can start a
        // prefetch without awaiting it and the client continues the same request.
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) || query.state.status === 'pending',
      },
    },
  });
}

/**
 * Only failures that may go away on their own: network errors (fetch throws a TypeError)
 * and an unavailable upstream. Retrying BAD_USER_INPUT or NOT_FOUND would just repeat them.
 */
function isRetryable(error: Error): boolean {
  if (error instanceof GraphqlRequestError) {
    return (
      error.codes.some((code) => RETRYABLE_ERROR_CODES.includes(code)) || error.httpStatus >= 500
    );
  }

  return error instanceof TypeError;
}
