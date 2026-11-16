# ADR 020: Ranked search results in GraphQL: a top-k list, not a connection

- **Status:** accepted (amends 009)
- **Date:** 2026-11-13

## Context

ADR 009 makes every list in the GraphQL API a connection (`nodes` + `pageInfo`), with asset-service's page token as the cursor. Text search (`searchAssets`) is different. ml-service answers it from an HNSW index (pgvector, ADR 018/019) with the `limit` nearest assets and no cursor. An approximate nearest-neighbour scan has no stable position to resume from: asking for "the next 20" means scanning again with a larger limit, and new embeddings between the two calls can shift the ranking. Each hit also carries a score, which belongs to the hit and not to the asset.

## Decision

`searchAssets(query: String!, first: Int! = 20): AssetSearchResult!` returns a ranked top-k list:

```graphql
type AssetSearchResult {
  hits: [AssetSearchHit!]! # best match first
  model: String! # the model that ranked them; scores of different models aren't comparable
}

type AssetSearchHit {
  asset: Asset!
  score: Float! # cosine similarity in [-1, 1]
}
```

- `first` is bounded like other lists (1–100) and the query to 500 characters (ml-service's limits, ADR 019). Both are checked in the gateway, so oversized requests never reach ml-service. A blank query is ml-service's rule and comes back as `BAD_USER_INPUT`.
- Assets are loaded through the request's asset DataLoader: all hits cost one `BatchGetAssets`. A hit whose asset no longer exists (deleted after it was embedded) is left out, and the order of the rest is kept.
- Ranked results that a client may want to page through later get a `first`/`after` pair only when the service behind them can resume a ranking; until then, a client shows more results by asking again with a larger `first`.

Considered: **`AssetConnection` with `pageInfo.hasNextPage` always false.** It matches `assets`, but `pageInfo` would promise paging that doesn't exist, and the score would need a separate field or an `edges` type that `assets` doesn't have.

## Consequences

- The connection rule of ADR 009 stays for catalogue lists. Ranked results use the `<Thing>SearchResult { hits { <thing>, score } }` shape.
- The web search page asks again with a larger `first` instead of paging, which is cheap: one text embedding (~15 ms warm) and one HNSW query.
