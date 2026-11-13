"""The service's gRPC server: thread pool, bounded concurrency, standard health (ADR 019)."""

from concurrent.futures import ThreadPoolExecutor

import grpc
from grpc_health.v1 import health, health_pb2, health_pb2_grpc

from ml_service.config import GrpcServerSettings
from ml_service.gen.meshdex.ml.v1 import ml_pb2_grpc
from ml_service.server.embedding_servicer import EmbeddingServicer

# Service name Kubernetes queries for readiness; liveness uses the empty name (whole server).
READINESS_SERVICE = "meshdex.ml.v1.EmbeddingService"
LIVENESS_SERVICE = ""

SERVING = health_pb2.HealthCheckResponse.SERVING
NOT_SERVING = health_pb2.HealthCheckResponse.NOT_SERVING


class GrpcServer:
    """Liveness ("the process serves") and readiness ("send me traffic") are separate on purpose,
    as in asset-service: during shutdown the pod stays alive but stops being ready, so Kubernetes
    takes it out of load balancing while in-flight calls finish."""

    def __init__(self, servicer: EmbeddingServicer, settings: GrpcServerSettings) -> None:
        self._settings = settings
        self._health = health.HealthServicer()
        # NOT_SERVING until start(): the model and database are checked before the port opens.
        for name in (LIVENESS_SERVICE, READINESS_SERVICE):
            self._health.set(name, NOT_SERVING)

        self._server = grpc.server(
            ThreadPoolExecutor(max_workers=settings.max_workers, thread_name_prefix="grpc"),
            # Over this, new calls fail fast with RESOURCE_EXHAUSTED instead of queueing for
            # a thread in memory without limit.
            maximum_concurrent_rpcs=settings.max_concurrent_rpcs,
        )
        ml_pb2_grpc.add_EmbeddingServiceServicer_to_server(servicer, self._server)
        health_pb2_grpc.add_HealthServicer_to_server(self._health, self._server)
        # The bound port: differs from the configured one when that is 0 (tests).
        self.port = self._server.add_insecure_port(settings.url)

    def start(self) -> None:
        self._server.start()
        for name in (LIVENESS_SERVICE, READINESS_SERVICE):
            self._health.set(name, SERVING)

    def stop(self) -> None:
        """Readiness off, then new calls are refused and in-flight ones get the grace period."""
        self._health.set(READINESS_SERVICE, NOT_SERVING)
        self._server.stop(self._settings.shutdown_grace_s).wait()
