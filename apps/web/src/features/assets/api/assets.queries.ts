import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import { executeGraphql } from '@/graphql/execute-graphql';
import { graphql } from '@/graphql/gql';
import type { AssetPageQuery } from '@/graphql/gql/graphql';
import { DEFAULT_STALE_TIME_MS } from '@/lib/query-client.constants';
import {
  ASSETS_PAGE_SIZE,
  DOWNLOAD_URL_EXPIRY_MARGIN_MS,
} from '@/features/assets/assets.constants';

export const previewImageFragment = graphql(`
  fragment PreviewImage on AssetVersion {
    thumbnails {
      file {
        url
      }
    }
    sourcePreview {
      url
    }
  }
`);

export const assetCardFragment = graphql(`
  fragment AssetCardFields on Asset {
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
      ...PreviewImage
    }
  }
`);

export const assetsPageDocument = graphql(`
  query AssetsPage($first: Int!, $after: String) {
    assets(first: $first, after: $after) {
      nodes {
        ...AssetCardFields
      }
      pageInfo {
        endCursor
        hasNextPage
      }
    }
  }
`);

/**
 * The key has no endpoint, so the server prefetch (internal endpoint) and the browser (public)
 * share one cache entry and hydrated pages aren't refetched.
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
        ...PreviewImage
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

/** Fresh until the signed URL nearly expires, so three.js finds the model in its cache (ADR 010). */
export function staleTimeUntilUrlExpiry(data: AssetPageQuery | undefined): number {
  const expiresAt = data?.asset?.currentVersion.originalDownloadUrl?.expiresAt;

  if (expiresAt === undefined) {
    return DEFAULT_STALE_TIME_MS;
  }

  return Math.max(0, Date.parse(expiresAt) - Date.now() - DOWNLOAD_URL_EXPIRY_MARGIN_MS);
}

export const searchAssetsDocument = graphql(`
  query SearchAssets($query: String!, $first: Int!) {
    searchAssets(query: $query, first: $first) {
      hits {
        score
        asset {
          ...AssetCardFields
        }
      }
    }
  }
`);

/** Ranked results have no cursor (ADR 020): "show more" asks again with a larger `first`. */
export function searchAssetsQueryOptions(endpoint: string, query: string, first: number) {
  return queryOptions({
    queryKey: ['assets', 'search', { query, first }],
    queryFn: ({ signal }) =>
      executeGraphql({
        endpoint,
        document: searchAssetsDocument,
        variables: { query, first },
        signal,
      }),
  });
}
