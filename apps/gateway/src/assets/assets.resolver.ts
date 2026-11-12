import { Inject, UseFilters } from '@nestjs/common';
import { Args, Context, Query, Resolver } from '@nestjs/graphql';
import { GraphQLError } from 'graphql';
import { ASSET_SERVICE } from '../clients/asset-service/asset-service.tokens';
import type { AssetServicePort } from '../clients/asset-service/domain/asset-service-port.interface';
import { AssetServiceUnavailableException } from '../clients/asset-service/exceptions/asset-service-unavailable.exception';
import { InvalidAssetRequestException } from '../clients/asset-service/exceptions/invalid-asset-request.exception';
import { GraphqlErrorCode } from '../graphql/domain/graphql-error-code.enum';
import { GraphqlExceptionFilter } from '../graphql/graphql-exception.filter';
import type { GraphqlContext } from '../graphql/domain/graphql-context.interface';
import { AssetArgs } from './dto/asset.args';
import { AssetsArgs } from './dto/assets.args';
import { AssetConnectionModel } from './models/asset-connection.model';
import { AssetModel } from './models/asset.model';

/** Asset queries; every field is answered by asset-service over gRPC (no data lives here). */
@Resolver(() => AssetModel)
@UseFilters(GraphqlExceptionFilter)
export class AssetsResolver {
  constructor(@Inject(ASSET_SERVICE) private readonly assetService: AssetServicePort) {}

  @Query(() => AssetModel, {
    nullable: true,
    description: 'An asset by id; null when it does not exist.',
  })
  async asset(
    @Args() args: AssetArgs,
    @Context('assetLoader') assetLoader: GraphqlContext['assetLoader'],
  ): Promise<AssetModel | null> {
    try {
      return await assetLoader.load(args.id);
    } catch (error) {
      throw this.toGraphQLError(error);
    }
  }

  @Query(() => AssetConnectionModel, { description: 'Assets, newest first.' })
  async assets(@Args() args: AssetsArgs): Promise<AssetConnectionModel> {
    try {
      const page = await this.assetService.listAssets({
        pageSize: args.first,
        pageToken: args.after ?? null,
        statuses: args.statuses ?? [],
        tag: args.tag ?? null,
      });

      return {
        nodes: page.assets,
        pageInfo: {
          endCursor: page.nextPageToken,
          hasNextPage: page.nextPageToken !== null,
        },
      };
    } catch (error) {
      throw this.toGraphQLError(error);
    }
  }

  /**
   * Maps the exceptions the asset reads can raise (an invalid cursor is the client's
   * INVALID_ARGUMENT); anything else passes through and is masked by the error formatter.
   */
  private toGraphQLError(error: unknown): unknown {
    if (error instanceof InvalidAssetRequestException) {
      return new GraphQLError(error.message, {
        extensions: { code: GraphqlErrorCode.BAD_USER_INPUT },
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
