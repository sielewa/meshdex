import { status } from '@grpc/grpc-js';
import { Controller } from '@nestjs/common';
import { GrpcMethod, RpcException } from '@nestjs/microservices';
import {
  ASSET_SERVICE_NAME,
  type AssetServiceController,
  type CompleteProcessingRequest,
  type CompleteProcessingResponse,
  type StoredObject as ProtoStoredObject,
  type StartProcessingRequest,
  type StartProcessingResponse,
} from '@meshdex/proto/asset/v1';
import { AssetProtoMapper } from '../catalog/asset-proto.mapper';
import type { StoredObject } from './domain/stored-object.interface';
import type { ProcessingOutcome } from './domain/processing-outcome.type';
import { InvalidAssetVersionIdException } from './exceptions/invalid-asset-version-id.exception';
import { InvalidProcessingResultException } from './exceptions/invalid-processing-result.exception';
import { AssetProcessingService } from './asset-processing.service';
import { AssetNotFoundException } from '../catalog/exceptions/asset-not-found.exception';
import { AssetVersionNotFoundException } from './exceptions/asset-version-not-found.exception';
import { ProcessingStateConflictException } from './exceptions/processing-state-conflict.exception';

/** Processing RPCs of `meshdex.asset.v1.AssetService`, called by the processing worker. */
@Controller()
export class AssetProcessingController implements Pick<
  AssetServiceController,
  'startProcessing' | 'completeProcessing'
> {
  constructor(
    private readonly processingService: AssetProcessingService,
    private readonly assetProtoMapper: AssetProtoMapper,
  ) {}

  @GrpcMethod(ASSET_SERVICE_NAME, 'StartProcessing')
  async startProcessing(request: StartProcessingRequest): Promise<StartProcessingResponse> {
    try {
      const version = await this.processingService.start(request.assetVersionId);

      return { version: this.assetProtoMapper.toProtoAssetVersion(version) };
    } catch (error) {
      throw this.toRpcException(error);
    }
  }

  @GrpcMethod(ASSET_SERVICE_NAME, 'CompleteProcessing')
  async completeProcessing(
    request: CompleteProcessingRequest,
  ): Promise<CompleteProcessingResponse> {
    try {
      const version = await this.processingService.complete(
        request.assetVersionId,
        this.toOutcome(request),
      );

      return { version: this.assetProtoMapper.toProtoAssetVersion(version) };
    } catch (error) {
      throw this.toRpcException(error);
    }
  }

  /** Maps the proto `oneof outcome` onto the domain union; exactly one branch must be set. */
  private toOutcome(request: CompleteProcessingRequest): ProcessingOutcome {
    const { succeeded, failed } = request;

    if (succeeded && !failed) {
      if (!succeeded.stats) {
        throw new InvalidProcessingResultException('succeeded.stats is required');
      }

      return {
        kind: 'succeeded',
        outputs: {
          optimized: this.requireStoredObject(succeeded.optimized, 'succeeded.optimized'),
          thumbnails: succeeded.thumbnails.map((thumbnail, index) => ({
            object: this.requireStoredObject(
              thumbnail.object,
              `succeeded.thumbnails[${String(index)}]`,
            ),
            width: thumbnail.width,
            height: thumbnail.height,
            view: thumbnail.view,
          })),
          stats: succeeded.stats,
        },
      };
    }

    if (failed && !succeeded) {
      return {
        kind: 'failed',
        reason: failed.reason,
      };
    }

    throw new InvalidProcessingResultException('Exactly one of succeeded/failed must be set');
  }

  private requireStoredObject(object: ProtoStoredObject | undefined, field: string): StoredObject {
    if (!object) {
      throw new InvalidProcessingResultException(`${field} is required`);
    }

    return {
      key: object.key,
      sizeBytes: object.sizeBytes,
      contentType: object.contentType,
    };
  }

  /** Maps the domain exceptions of the processing RPCs to gRPC status codes; unknown errors become INTERNAL. */
  private toRpcException(error: unknown): unknown {
    if (
      error instanceof InvalidAssetVersionIdException ||
      error instanceof InvalidProcessingResultException
    ) {
      return new RpcException({
        code: status.INVALID_ARGUMENT,
        message: error.message,
      });
    }

    if (error instanceof AssetVersionNotFoundException || error instanceof AssetNotFoundException) {
      return new RpcException({
        code: status.NOT_FOUND,
        message: error.message,
      });
    }

    if (error instanceof ProcessingStateConflictException) {
      return new RpcException({
        code: status.FAILED_PRECONDITION,
        message: error.message,
      });
    }

    return error;
  }
}
