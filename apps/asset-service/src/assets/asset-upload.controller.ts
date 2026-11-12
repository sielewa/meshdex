import { status } from '@grpc/grpc-js';
import { Controller } from '@nestjs/common';
import { GrpcMethod, RpcException } from '@nestjs/microservices';
import {
  ASSET_SERVICE_NAME,
  type AbortUploadRequest,
  type AbortUploadResponse,
  type AssetServiceController,
  type CompleteUploadRequest,
  type CompleteUploadResponse,
  type GetUploadPartUrlsRequest,
  type GetUploadPartUrlsResponse,
  type InitiateUploadRequest,
  type InitiateUploadResponse,
  type UploadPartUrl,
} from '@meshdex/proto/asset/v1';
import { toProtoTimestamp } from '@meshdex/shared';
import { AssetProtoMapper } from '../catalog/asset-proto.mapper';
import { AssetUploadService } from './asset-upload.service';
import type { PresignedPart } from './domain/presigned-part.interface';
import { AssetNotFoundException } from '../catalog/exceptions/asset-not-found.exception';
import { AssetVersionNotFoundException } from './exceptions/asset-version-not-found.exception';
import { InvalidAssetVersionIdException } from './exceptions/invalid-asset-version-id.exception';
import { InvalidUploadRequestException } from './exceptions/invalid-upload-request.exception';
import { UploadNotInProgressException } from './exceptions/upload-not-in-progress.exception';

/**
 * Upload RPCs of `meshdex.asset.v1.AssetService`. Other RPCs of the same service live in
 * other controllers; `implements Pick<...>` keeps each method checked against the contract.
 */
@Controller()
export class AssetUploadController implements Pick<
  AssetServiceController,
  'initiateUpload' | 'getUploadPartUrls' | 'completeUpload' | 'abortUpload'
> {
  constructor(
    private readonly uploadService: AssetUploadService,
    private readonly assetProtoMapper: AssetProtoMapper,
  ) {}

  @GrpcMethod(ASSET_SERVICE_NAME, 'InitiateUpload')
  async initiateUpload(request: InitiateUploadRequest): Promise<InitiateUploadResponse> {
    try {
      const upload = await this.uploadService.initiate({
        title: request.title,
        tags: request.tags,
        fileName: request.fileName,
        contentType: request.contentType,
        sizeBytes: request.sizeBytes,
      });

      return {
        assetId: upload.assetId,
        assetVersionId: upload.versionId,
        partSizeBytes: upload.partSizeBytes,
        parts: upload.parts.map((part) => this.toProtoPart(part)),
        sourcePreviewUpload: undefined,
      };
    } catch (error) {
      throw this.toRpcException(error);
    }
  }

  @GrpcMethod(ASSET_SERVICE_NAME, 'GetUploadPartUrls')
  async getUploadPartUrls(request: GetUploadPartUrlsRequest): Promise<GetUploadPartUrlsResponse> {
    try {
      const parts = await this.uploadService.getPartUrls(
        request.assetVersionId,
        request.partNumbers,
      );

      return { parts: parts.map((part) => this.toProtoPart(part)) };
    } catch (error) {
      throw this.toRpcException(error);
    }
  }

  @GrpcMethod(ASSET_SERVICE_NAME, 'CompleteUpload')
  async completeUpload(request: CompleteUploadRequest): Promise<CompleteUploadResponse> {
    try {
      const asset = await this.uploadService.complete(request.assetVersionId, request.parts);

      return { asset: this.assetProtoMapper.toProtoAsset(asset) };
    } catch (error) {
      throw this.toRpcException(error);
    }
  }

  @GrpcMethod(ASSET_SERVICE_NAME, 'AbortUpload')
  async abortUpload(request: AbortUploadRequest): Promise<AbortUploadResponse> {
    try {
      await this.uploadService.abort(request.assetVersionId);

      return {};
    } catch (error) {
      throw this.toRpcException(error);
    }
  }

  private toProtoPart(part: PresignedPart): UploadPartUrl {
    return {
      partNumber: part.partNumber,
      url: part.url,
      expiresAt: toProtoTimestamp(part.expiresAt),
    };
  }

  /** Maps the domain exceptions of the upload RPCs to gRPC status codes; unknown errors become INTERNAL. */
  private toRpcException(error: unknown): unknown {
    if (
      error instanceof InvalidAssetVersionIdException ||
      error instanceof InvalidUploadRequestException
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

    if (error instanceof UploadNotInProgressException) {
      return new RpcException({
        code: status.FAILED_PRECONDITION,
        message: error.message,
      });
    }

    return error;
  }
}
