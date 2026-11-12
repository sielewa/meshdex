import { status, type ServiceError } from '@grpc/grpc-js';
import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { lastValueFrom, type Observable } from 'rxjs';
import {
  ASSET_SERVICE_NAME,
  type AssetServiceClient,
  type UploadPartUrl as ProtoUploadPartUrl,
} from '@meshdex/proto/asset/v1';
import { fromProtoTimestamp } from '@meshdex/shared';
import { ASSET_SERVICE_GRPC_CLIENT } from '../asset-service.tokens';
import type { AssetServicePort } from '../domain/asset-service-port.interface';
import type { CompletedPart } from '../domain/completed-part.interface';
import type { InitiateUploadCommand } from '../domain/initiate-upload-command.interface';
import type { UploadPartUrl } from '../domain/upload-part-url.interface';
import type { UploadSession } from '../domain/upload-session.interface';
import { AssetServiceRequestException } from '../exceptions/asset-service-request.exception';

/**
 * `AssetServicePort` over gRPC. Generated proto types stop here, and gRPC status codes become
 * `AssetServiceRequestException`. Deadlines and transport retries come from the channel's
 * service config (`AssetServiceClientOptionsFactory`), so every call here has one.
 */
@Injectable()
export class GrpcAssetServiceAdapter implements AssetServicePort, OnModuleInit {
  private client!: AssetServiceClient;

  constructor(@Inject(ASSET_SERVICE_GRPC_CLIENT) private readonly grpc: ClientGrpc) {}

  /** The proto is loaded when the module initialises; the TCP connection opens on the first call. */
  onModuleInit(): void {
    this.client = this.grpc.getService<AssetServiceClient>(ASSET_SERVICE_NAME);
  }

  async initiateUpload(command: InitiateUploadCommand): Promise<UploadSession> {
    const response = await this.call(this.client.initiateUpload(command));

    return {
      assetId: response.assetId,
      assetVersionId: response.assetVersionId,
      partSizeBytes: response.partSizeBytes,
      parts: response.parts.map((part) => this.toUploadPartUrl(part)),
    };
  }

  async getUploadPartUrls(assetVersionId: string, partNumbers: number[]): Promise<UploadPartUrl[]> {
    const response = await this.call(
      this.client.getUploadPartUrls({
        assetVersionId,
        partNumbers,
      }),
    );

    return response.parts.map((part) => this.toUploadPartUrl(part));
  }

  async completeUpload(assetVersionId: string, parts: CompletedPart[]): Promise<void> {
    await this.call(
      this.client.completeUpload({
        assetVersionId,
        parts,
      }),
    );
  }

  async abortUpload(assetVersionId: string): Promise<void> {
    await this.call(this.client.abortUpload({ assetVersionId }));
  }

  /**
   * NestJS returns a cold Observable: the RPC starts on subscription (`lastValueFrom`).
   * Every call goes through here so error mapping can't be skipped.
   */
  private async call<T>(response$: Observable<T>): Promise<T> {
    try {
      return await lastValueFrom(response$);
    } catch (error) {
      throw this.toRequestException(error);
    }
  }

  /**
   * asset-service writes safe, descriptive messages for the codes it returns on purpose
   * (invalid title, file too big…), so `details` is kept for the run's failure list. For
   * transport failures it is not: it may name hosts and ports.
   */
  private toRequestException(error: unknown): unknown {
    if (!this.isServiceError(error)) {
      return error;
    }

    switch (error.code) {
      case status.UNAVAILABLE:
      case status.DEADLINE_EXCEEDED:
        return new AssetServiceRequestException('asset-service is unavailable', true, {
          cause: error,
        });
      case status.INVALID_ARGUMENT:
      case status.NOT_FOUND:
      case status.FAILED_PRECONDITION:
      case status.ALREADY_EXISTS:
        return new AssetServiceRequestException(`asset-service: ${error.details}`, false, {
          cause: error,
        });
      default:
        return error;
    }
  }

  /** Errors from a gRPC call carry the status `code` and the server's `details` message. */
  private isServiceError(error: unknown): error is ServiceError {
    return (
      error instanceof Error &&
      'code' in error &&
      typeof error.code === 'number' &&
      'details' in error &&
      typeof error.details === 'string'
    );
  }

  private toUploadPartUrl(part: ProtoUploadPartUrl): UploadPartUrl {
    if (part.expiresAt === undefined) {
      throw new Error(
        `asset-service response is missing UploadPartUrl ${part.partNumber} expiresAt`,
      );
    }

    return {
      partNumber: part.partNumber,
      url: part.url,
      expiresAt: fromProtoTimestamp(part.expiresAt),
    };
  }
}
