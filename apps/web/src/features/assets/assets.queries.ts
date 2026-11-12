import { infiniteQueryOptions } from '@tanstack/react-query';
import { executeGraphql } from '@/graphql/execute-graphql';
import { graphql } from '@/graphql/gql';
import { ASSETS_PAGE_SIZE } from './assets.constants';

export const assetsPageDocument = graphql(`
  query AssetsPage($first: Int!, $after: String) {
    assets(first: $first, after: $after) {
      nodes {
        id
        title
        tags
        status
        createdAt
        currentVersion {
          number
          original {
            sizeBytes
          }
        }
      }
      pageInfo {
        endCursor
        hasNextPage
      }
    }
  }
`);

/**
 * The asset list as an infinite query: each page is one `assets` call, the next page starts
 * after the previous page's `endCursor` (ADR 009). Used by the server prefetch (internal
 * endpoint) and by `AssetGrid` (public endpoint); the key has no endpoint, so both share
 * one cache entry and the hydrated pages are reused instead of refetched.
 */
export function assetsInfiniteQueryOptions(endpoint: string) {
  return infiniteQueryOptions({
    queryKey: ['assets', 'list', { pageSize: ASSETS_PAGE_SIZE }],
    queryFn: ({ pageParam, signal }) =>
      executeGraphql({
        endpoint,
        document: assetsPageDocument,
        variables: {
          first: ASSETS_PAGE_SIZE,
          after: pageParam,
        },
        signal,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) =>
      lastPage.assets.pageInfo.hasNextPage ? lastPage.assets.pageInfo.endCursor : undefined,
  });
}
