import { status } from '@grpc/grpc-js';
import { Controller } from '@nestjs/common';
import { GrpcMethod, RpcException } from '@nestjs/microservices';
import { validate as isUuid } from 'uuid';
import {
  ASSET_SERVICE_NAME,
  AssetVersionStatus as ProtoAssetVersionStatus,
  type AssetServiceController,
  type BatchGetAssetsRequest,
  type BatchGetAssetsResponse,
  type GetAssetRequest,
  type GetAssetResponse,
  type ListAssetsRequest,
  type ListAssetsResponse,
} from '@meshdex/proto/asset/v1';
import { AssetProtoMapper } from './asset-proto.mapper';
import { AssetVersionStatus } from '../assets/domain/asset-version-status.enum';
import { CatalogService } from './catalog.service';
import type { PageCursor } from './domain/page-cursor.interface';
import { InvalidCatalogRequestException } from './exceptions/invalid-catalog-request.exception';
import { AssetNotFoundException } from './exceptions/asset-not-found.exception';

@Controller()
export class CatalogController implements Pick<
  AssetServiceController,
  'getAsset' | 'batchGetAssets' | 'listAssets'
> {
  constructor(
    private readonly catalogService: CatalogService,
    private readonly assetProtoMapper: AssetProtoMapper,
  ) {}

  @GrpcMethod(ASSET_SERVICE_NAME, 'GetAsset')
  async getAsset(request: GetAssetRequest): Promise<GetAssetResponse> {
    try {
      return {
        asset: this.assetProtoMapper.toProtoAsset(
          await this.catalogService.getAsset(request.assetId),
        ),
      };
    } catch (error) {
      throw this.toRpcException(error);
    }
  }

  @GrpcMethod(ASSET_SERVICE_NAME, 'BatchGetAssets')
  async batchGetAssets(request: BatchGetAssetsRequest): Promise<BatchGetAssetsResponse> {
    try {
      const result = await this.catalogService.batchGet(request.assetIds);

      return {
        assets: result.assets.map((asset) => this.assetProtoMapper.toProtoAsset(asset)),
        notFoundAssetIds: result.notFoundIds,
      };
    } catch (error) {
      throw this.toRpcException(error);
    }
  }

  @GrpcMethod(ASSET_SERVICE_NAME, 'ListAssets')
  async listAssets(request: ListAssetsRequest): Promise<ListAssetsResponse> {
    try {
      const statuses = request.statuses.map((protoStatus) => this.fromProtoStatus(protoStatus));
      const page = await this.catalogService.list({
        pageSize: request.pageSize,
        after: this.decodePageToken(request.pageToken),
        statuses,
        tag: request.tag,
      });

      return {
        assets: page.assets.map((asset) => this.assetProtoMapper.toProtoAsset(asset)),
        nextPageToken: page.next ? this.encodePageToken(page.next) : '',
      };
    } catch (error) {
      throw this.toRpcException(error);
    }
  }

  /**
   * Opaque to clients, so the encoding can change; that is why it lives in the transport layer.
   * Not secret: a forged token only moves the caller within a listing it may read anyway.
   */
  private encodePageToken(cursor: PageCursor): string {
    return Buffer.from(
      JSON.stringify({
        c: cursor.createdAt,
        i: cursor.id,
      }),
    ).toString('base64url');
  }

  /** The id is checked too: a forged token must not reach the keyset query's uuid comparison. */
  private decodePageToken(token: string): PageCursor | null {
    if (token === '') {
      return null;
    }

    try {
      const parsed: unknown = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'));

      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'c' in parsed &&
        'i' in parsed &&
        typeof parsed.c === 'number' &&
        Number.isSafeInteger(parsed.c) &&
        typeof parsed.i === 'string' &&
        isUuid(parsed.i)
      ) {
        return {
          createdAt: parsed.c,
          id: parsed.i,
        };
      }
    } catch {
      // Not base64url JSON: the same error as any other malformed token.
    }

    throw new InvalidCatalogRequestException('Invalid page token');
  }

  /** Unknown errors pass through as INTERNAL without leaking their message. */
  private toRpcException(error: unknown): unknown {
    if (error instanceof InvalidCatalogRequestException) {
      return new RpcException({
        code: status.INVALID_ARGUMENT,
        message: error.message,
      });
    }

    if (error instanceof AssetNotFoundException) {
      return new RpcException({
        code: status.NOT_FOUND,
        message: error.message,
      });
    }

    return error;
  }

  /** Also rejects values from a newer client. */
  private fromProtoStatus(status: ProtoAssetVersionStatus): AssetVersionStatus {
    switch (status) {
      case ProtoAssetVersionStatus.ASSET_VERSION_STATUS_UPLOADING:
        return AssetVersionStatus.UPLOADING;
      case ProtoAssetVersionStatus.ASSET_VERSION_STATUS_UPLOADED:
        return AssetVersionStatus.UPLOADED;
      case ProtoAssetVersionStatus.ASSET_VERSION_STATUS_PROCESSING:
        return AssetVersionStatus.PROCESSING;
      case ProtoAssetVersionStatus.ASSET_VERSION_STATUS_READY:
        return AssetVersionStatus.READY;
      case ProtoAssetVersionStatus.ASSET_VERSION_STATUS_FAILED:
        return AssetVersionStatus.FAILED;
      default:
        throw new InvalidCatalogRequestException(`Unknown status filter ${String(status)}`);
    }
  }
}
