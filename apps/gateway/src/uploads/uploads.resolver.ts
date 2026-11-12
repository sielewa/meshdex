import { Inject, UseFilters } from '@nestjs/common';
import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { GraphQLError } from 'graphql';
import { ASSET_SERVICE } from '../clients/asset-service/asset-service.tokens';
import type { AssetServicePort } from '../clients/asset-service/domain/asset-service-port.interface';
import { AssetServiceUnavailableException } from '../clients/asset-service/exceptions/asset-service-unavailable.exception';
import { AssetStateConflictException } from '../clients/asset-service/exceptions/asset-state-conflict.exception';
import { InvalidAssetRequestException } from '../clients/asset-service/exceptions/invalid-asset-request.exception';
import { ResourceNotFoundException } from '../clients/asset-service/exceptions/resource-not-found.exception';
import { AssetModel } from '../assets/models/asset.model';
import { GraphqlErrorCode } from '../graphql/domain/graphql-error-code.enum';
import { GraphqlExceptionFilter } from '../graphql/graphql-exception.filter';
import { AbortUploadArgs } from './dto/abort-upload.args';
import { CompleteUploadInput } from './dto/complete-upload.input';
import { InitiateUploadInput } from './dto/initiate-upload.input';
import { RenewUploadPartUrlsArgs } from './dto/renew-upload-part-urls.args';
import { UploadPartUrlModel } from './models/upload-part-url.model';
import { UploadSessionModel } from './models/upload-session.model';

/**
 * Presigned multipart upload: the browser sends file bytes straight to object storage,
 * the gateway only brokers URLs and the final "complete" call (architecture.md, upload flow).
 */
@Resolver()
@UseFilters(GraphqlExceptionFilter)
export class UploadsResolver {
  constructor(@Inject(ASSET_SERVICE) private readonly assetService: AssetServicePort) {}

  @Mutation(() => UploadSessionModel, {
    description: 'Creates an asset in UPLOADING state and returns presigned URLs for every part.',
  })
  async initiateUpload(@Args('input') input: InitiateUploadInput): Promise<UploadSessionModel> {
    try {
      return await this.assetService.initiateUpload(input);
    } catch (error) {
      throw this.toGraphQLError(error);
    }
  }

  /**
   * A mutation although it changes no state: presigned URLs expire, and GraphQL clients
   * cache query results, so a query here could hand back URLs that no longer work.
   */
  @Mutation(() => [UploadPartUrlModel], {
    description: 'Fresh presigned URLs to resume an upload or replace expired ones.',
  })
  async renewUploadPartUrls(@Args() args: RenewUploadPartUrlsArgs): Promise<UploadPartUrlModel[]> {
    try {
      return await this.assetService.getUploadPartUrls(args.assetVersionId, args.partNumbers ?? []);
    } catch (error) {
      throw this.toGraphQLError(error);
    }
  }

  @Mutation(() => AssetModel, {
    description: 'Assembles the uploaded parts; the version moves to UPLOADED.',
  })
  async completeUpload(@Args('input') input: CompleteUploadInput): Promise<AssetModel> {
    try {
      return await this.assetService.completeUpload(input.assetVersionId, input.parts);
    } catch (error) {
      throw this.toGraphQLError(error);
    }
  }

  @Mutation(() => Boolean, { description: 'Cancels an unfinished upload and frees stored parts.' })
  async abortUpload(@Args() args: AbortUploadArgs): Promise<boolean> {
    try {
      await this.assetService.abortUpload(args.assetVersionId);

      return true;
    } catch (error) {
      throw this.toGraphQLError(error);
    }
  }

  /** Maps every exception the upload RPCs can raise; unknown errors are masked by the formatter. */
  private toGraphQLError(error: unknown): unknown {
    if (error instanceof InvalidAssetRequestException) {
      return new GraphQLError(error.message, {
        extensions: { code: GraphqlErrorCode.BAD_USER_INPUT },
        originalError: error,
      });
    }

    if (error instanceof ResourceNotFoundException) {
      return new GraphQLError(error.message, {
        extensions: { code: GraphqlErrorCode.NOT_FOUND },
        originalError: error,
      });
    }

    if (error instanceof AssetStateConflictException) {
      return new GraphQLError(error.message, {
        extensions: { code: GraphqlErrorCode.CONFLICT },
        originalError: error,
      });
    }

    if (error instanceof AssetServiceUnavailableException) {
      return new GraphQLError(error.message, {
        extensions: { code: GraphqlErrorCode.SERVICE_UNAVAILABLE },
        originalError: error,
      });
    }

    return error;
  }
}
