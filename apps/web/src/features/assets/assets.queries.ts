import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import { executeGraphql } from '@/graphql/execute-graphql';
import { graphql } from '@/graphql/gql';
import type { AssetPageQuery } from '@/graphql/gql/graphql';
import { DEFAULT_STALE_TIME_MS } from '@/lib/query-client.constants';
import { ASSETS_PAGE_SIZE, DOWNLOAD_URL_EXPIRY_MARGIN_MS } from './assets.constants';

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

export const assetPageDocument = graphql(`
  query AssetPage($id: ID!) {
    asset(id: $id) {
      id
      title
      tags
      status
      createdAt
      updatedAt
      currentVersion {
        id
        number
        status
        failureReason
        createdAt
        processedAt
        original {
          sizeBytes
          contentType
        }
        originalDownloadUrl {
          url
          expiresAt
        }
        stats {
          triangleCount
          vertexCount
          meshCount
          textureCount
        }
      }
    }
  }
`);

/**
 * One asset with a short-lived download URL. Shared by the page's server prefetch and
 * `AssetView`; `asset` is `null` when it doesn't exist.
 */
export function assetQueryOptions(endpoint: string, id: string) {
  return queryOptions({
    queryKey: ['assets', 'detail', id],
    queryFn: ({ signal }) =>
      executeGraphql({
        endpoint,
        document: assetPageDocument,
        variables: { id },
        signal,
      }),
    staleTime: (query) => staleTimeUntilUrlExpiry(query.state.data),
  });
}

/**
 * Cached data stays fresh until shortly before the signed URL expires (ADR 010). Returning
 * to the page within that window reuses the same URL, so three.js finds the model in its
 * cache instead of downloading it again under a new signature.
 */
export function staleTimeUntilUrlExpiry(data: AssetPageQuery | undefined): number {
  const expiresAt = data?.asset?.currentVersion.originalDownloadUrl?.expiresAt;

  if (expiresAt === undefined) {
    return DEFAULT_STALE_TIME_MS;
  }

  return Math.max(0, Date.parse(expiresAt) - Date.now() - DOWNLOAD_URL_EXPIRY_MARGIN_MS);
}
