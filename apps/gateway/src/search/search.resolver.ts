import { Inject, UseFilters } from '@nestjs/common';
import { Args, Context, Query, Resolver } from '@nestjs/graphql';
import { GraphQLError } from 'graphql';
import { AssetServiceUnavailableException } from '../clients/asset-service/exceptions/asset-service-unavailable.exception';
import type { MlServicePort } from '../clients/ml-service/domain/ml-service-port.interface';
import { InvalidSearchRequestException } from '../clients/ml-service/exceptions/invalid-search-request.exception';
import { MlServiceUnavailableException } from '../clients/ml-service/exceptions/ml-service-unavailable.exception';
import { ML_SERVICE } from '../clients/ml-service/ml-service.tokens';
import { GraphqlErrorCode } from '../graphql/domain/graphql-error-code.enum';
import type { GraphqlContext } from '../graphql/domain/graphql-context.interface';
import { GraphqlExceptionFilter } from '../graphql/graphql-exception.filter';
import { SearchAssetsArgs } from './dto/search-assets.args';
import type { AssetSearchHitModel } from './models/asset-search-hit.model';
import { AssetSearchResultModel } from './models/asset-search-result.model';

/** Text search: ml-service ranks asset ids, asset-service supplies the assets. */
@Resolver(() => AssetSearchResultModel)
@UseFilters(GraphqlExceptionFilter)
export class SearchResolver {
  constructor(@Inject(ML_SERVICE) private readonly mlService: MlServicePort) {}

  @Query(() => AssetSearchResultModel, {
    description:
      'Assets ranked by how well their images match a natural-language query (CLIP), best first.',
  })
  async searchAssets(
    @Args() args: SearchAssetsArgs,
    @Context('assetLoader') assetLoader: GraphqlContext['assetLoader'],
  ): Promise<AssetSearchResultModel> {
    try {
      const result = await this.mlService.searchAssets(args.query, args.first);
      // One BatchGetAssets for all hits (the request's DataLoader), results in hit order.
      const assets = await assetLoader.loadMany(result.hits.map((hit) => hit.assetId));
      const hits: AssetSearchHitModel[] = [];

      result.hits.forEach((hit, index) => {
        const asset = assets[index];

        if (asset instanceof Error) {
          throw asset;
        }

        // Embedded but no longer in the catalogue (deleted since): left out, order kept.
        if (asset) {
          hits.push({ asset, score: hit.score });
        }
      });

      return { hits, model: result.model };
    } catch (error) {
      throw this.toGraphQLError(error);
    }
  }

  private toGraphQLError(error: unknown): unknown {
    if (error instanceof InvalidSearchRequestException) {
      return new GraphQLError(error.message, {
        extensions: { code: GraphqlErrorCode.BAD_USER_INPUT },
        originalError: error,
      });
    }

    if (
      error instanceof MlServiceUnavailableException ||
      error instanceof AssetServiceUnavailableException
    ) {
      return new GraphQLError(error.message, {
        extensions: { code: GraphqlErrorCode.SERVICE_UNAVAILABLE },
        originalError: error,
      });
    }

    return error;
  }
}
