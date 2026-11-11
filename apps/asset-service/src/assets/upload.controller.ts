import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
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
import { toProtoAsset } from './asset.mapper';
import { toRpcException } from './assets-rpc-errors';
import { UploadService, type PresignedPart } from './upload.service';

type UploadRpcs = Pick<
  AssetServiceController,
  'initiateUpload' | 'getUploadPartUrls' | 'completeUpload' | 'abortUpload'
>;

function toProtoPart(part: PresignedPart): UploadPartUrl {
  return {
    partNumber: part.partNumber,
    url: part.url,
    expiresAt: toProtoTimestamp(part.expiresAt),
  };
}

/**
 * Upload RPCs of `meshdex.asset.v1.AssetService`. Other RPCs of the same service live in
 * other controllers; `implements Pick<...>` keeps each method checked against the contract.
 */
@Controller()
export class UploadController implements UploadRpcs {
  constructor(private readonly uploadService: UploadService) {}

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
        parts: upload.parts.map(toProtoPart),
      };
    } catch (error) {
      throw toRpcException(error);
    }
  }

  @GrpcMethod(ASSET_SERVICE_NAME, 'GetUploadPartUrls')
  async getUploadPartUrls(request: GetUploadPartUrlsRequest): Promise<GetUploadPartUrlsResponse> {
    try {
      const parts = await this.uploadService.getPartUrls(
        request.assetVersionId,
        request.partNumbers,
      );

      return { parts: parts.map(toProtoPart) };
    } catch (error) {
      throw toRpcException(error);
    }
  }

  @GrpcMethod(ASSET_SERVICE_NAME, 'CompleteUpload')
  async completeUpload(request: CompleteUploadRequest): Promise<CompleteUploadResponse> {
    try {
      const asset = await this.uploadService.complete(request.assetVersionId, request.parts);

      return { asset: toProtoAsset(asset) };
    } catch (error) {
      throw toRpcException(error);
    }
  }

  @GrpcMethod(ASSET_SERVICE_NAME, 'AbortUpload')
  async abortUpload(request: AbortUploadRequest): Promise<AbortUploadResponse> {
    try {
      await this.uploadService.abort(request.assetVersionId);

      return {};
    } catch (error) {
      throw toRpcException(error);
    }
  }
}
