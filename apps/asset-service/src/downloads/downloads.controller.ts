import { status } from '@grpc/grpc-js';
import { Controller } from '@nestjs/common';
import { GrpcMethod, RpcException } from '@nestjs/microservices';
import {
  ASSET_SERVICE_NAME,
  type AssetServiceController,
  type GetOriginalDownloadUrlsRequest,
  type GetOriginalDownloadUrlsResponse,
} from '@meshdex/proto/asset/v1';
import { toProtoTimestamp } from '@meshdex/shared';
import { DownloadsService } from './downloads.service';
import { InvalidDownloadRequestException } from './exceptions/invalid-download-request.exception';

/** Download RPCs of `meshdex.asset.v1.AssetService`. */
@Controller()
export class DownloadsController implements Pick<
  AssetServiceController,
  'getOriginalDownloadUrls'
> {
  constructor(private readonly downloadsService: DownloadsService) {}

  @GrpcMethod(ASSET_SERVICE_NAME, 'GetOriginalDownloadUrls')
  async getOriginalDownloadUrls(
    request: GetOriginalDownloadUrlsRequest,
  ): Promise<GetOriginalDownloadUrlsResponse> {
    try {
      const urls = await this.downloadsService.getOriginalDownloadUrls(request.assetVersionIds);

      return {
        urls: urls.map((download) => ({
          assetVersionId: download.versionId,
          url: download.url,
          expiresAt: toProtoTimestamp(download.expiresAt),
        })),
      };
    } catch (error) {
      throw this.toRpcException(error);
    }
  }

  /** Maps the service's only domain exception; unknown errors pass through as INTERNAL. */
  private toRpcException(error: unknown): unknown {
    if (error instanceof InvalidDownloadRequestException) {
      return new RpcException({
        code: status.INVALID_ARGUMENT,
        message: error.message,
      });
    }

    return error;
  }
}
