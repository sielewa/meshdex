import { status, type ServiceError } from '@grpc/grpc-js';
import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { lastValueFrom, type Observable } from 'rxjs';
import { EMBEDDING_SERVICE_NAME, type EmbeddingServiceClient } from '@meshdex/proto/ml/v1';
import type { MlServicePort } from '../domain/ml-service-port.interface';
import type { SearchResult } from '../domain/search-result.interface';
import { InvalidSearchRequestException } from '../exceptions/invalid-search-request.exception';
import { MlServiceUnavailableException } from '../exceptions/ml-service-unavailable.exception';
import { ML_SERVICE_GRPC_CLIENT } from '../ml-service.tokens';

/**
 * `MlServicePort` over gRPC: maps responses to domain interfaces and gRPC status codes to
 * domain exceptions. Deadline and retries come from the channel's service config.
 */
@Injectable()
export class GrpcMlServiceAdapter implements MlServicePort, OnModuleInit {
  private client!: EmbeddingServiceClient;

  constructor(@Inject(ML_SERVICE_GRPC_CLIENT) private readonly grpc: ClientGrpc) {}

  onModuleInit(): void {
    this.client = this.grpc.getService<EmbeddingServiceClient>(EMBEDDING_SERVICE_NAME);
  }

  async searchAssets(query: string, limit: number): Promise<SearchResult> {
    const response = await this.call(this.client.searchAssets({ query, limit }));

    return {
      hits: response.hits.map((hit) => ({
        assetId: hit.assetId,
        score: hit.score,
      })),
      model: response.model,
    };
  }

  private async call<T>(response$: Observable<T>): Promise<T> {
    try {
      return await lastValueFrom(response$);
    } catch (error) {
      throw this.toDomainException(error);
    }
  }

  /**
   * Status codes the gateway can explain to a client; anything else (UNIMPLEMENTED,
   * INTERNAL…) is a bug or a misconfiguration, rethrown unchanged and masked by the
   * GraphQL error formatter.
   */
  private toDomainException(error: unknown): unknown {
    if (!this.isServiceError(error)) {
      return error;
    }

    switch (error.code) {
      case status.INVALID_ARGUMENT:
        return new InvalidSearchRequestException(error.details);
      // RESOURCE_EXHAUSTED: over ml-service's concurrency limit (ADR 019), busy; try later.
      case status.UNAVAILABLE:
      case status.DEADLINE_EXCEEDED:
      case status.RESOURCE_EXHAUSTED:
        return new MlServiceUnavailableException('ml-service is unavailable', { cause: error });
      default:
        return error;
    }
  }

  private isServiceError(error: unknown): error is ServiceError {
    return (
      error instanceof Error &&
      'code' in error &&
      typeof error.code === 'number' &&
      'details' in error &&
      typeof error.details === 'string'
    );
  }
}
