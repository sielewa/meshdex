"""gRPC transport of meshdex.ml.v1.EmbeddingService: maps messages to domain calls and domain
exceptions to status codes; holds no business rules."""

import logging
import time

import grpc

from ml_service.gen.meshdex.ml.v1 import ml_pb2, ml_pb2_grpc
from ml_service.search.exceptions import InvalidSearchQueryError
from ml_service.search.search_service import SearchService

logger = logging.getLogger(__name__)


class EmbeddingServicer(ml_pb2_grpc.EmbeddingServiceServicer):
    def __init__(self, search: SearchService) -> None:
        self._search = search

    def SearchAssets(  # noqa: N802 (generated method name)
        self, request: ml_pb2.SearchAssetsRequest, context: grpc.ServicerContext
    ) -> ml_pb2.SearchAssetsResponse:
        started = time.perf_counter()
        try:
            result = self._search.search(request.query, request.limit)
        except InvalidSearchQueryError as error:
            context.abort(grpc.StatusCode.INVALID_ARGUMENT, str(error))

        logger.debug(
            "Search answered",
            extra={
                "hits": len(result.hits),
                "duration_ms": round((time.perf_counter() - started) * 1000, 1),
            },
        )

        return ml_pb2.SearchAssetsResponse(
            model=result.model,
            hits=[
                ml_pb2.SearchHit(asset_id=str(hit.asset_id), score=hit.score) for hit in result.hits
            ],
        )

    def EmbedAsset(  # noqa: N802
        self, request: ml_pb2.EmbedAssetRequest, context: grpc.ServicerContext
    ) -> ml_pb2.EmbedAssetResponse:
        # Called by the processing worker, which doesn't exist yet; until then the reindex job
        # embeds assets (ADR 018, ADR 019).
        context.abort(grpc.StatusCode.UNIMPLEMENTED, "EmbedAsset is not implemented yet")
