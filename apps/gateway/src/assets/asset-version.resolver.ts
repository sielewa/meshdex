import { UseFilters } from '@nestjs/common';
import { Context, Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { GraphQLError } from 'graphql';
import type { AssetVersion } from '../clients/asset-service/domain/asset-version.interface';
import { AssetServiceUnavailableException } from '../clients/asset-service/exceptions/asset-service-unavailable.exception';
import { GraphqlErrorCode } from '../graphql/domain/graphql-error-code.enum';
import type { GraphqlContext } from '../graphql/domain/graphql-context.interface';
import { GraphqlExceptionFilter } from '../graphql/graphql-exception.filter';
import { AssetVersionModel } from './models/asset-version.model';
import { SignedUrlModel } from './models/signed-url.model';

/**
 * Fields of `AssetVersion` that cost a call to asset-service. They are resolved only when a
 * query selects them, so asset lists that don't ask for a download link sign nothing.
 */
@Resolver(() => AssetVersionModel)
@UseFilters(GraphqlExceptionFilter)
export class AssetVersionResolver {
  @ResolveField(() => SignedUrlModel, {
    nullable: true,
    description: 'Short-lived link to the uploaded file; null until the upload is complete.',
  })
  async originalDownloadUrl(
    @Parent() version: AssetVersion,
    @Context('originalDownloadUrlLoader')
    loader: GraphqlContext['originalDownloadUrlLoader'],
  ): Promise<SignedUrlModel | null> {
    try {
      return await loader.load(version.id);
    } catch (error) {
      throw this.toGraphQLError(error);
    }
  }

  /**
   * Version ids come from asset-service itself, so INVALID_ARGUMENT can't happen here; the
   * only expected failure is an unavailable upstream. The field is nullable, so the rest of
   * the asset is still returned next to the error.
   */
  private toGraphQLError(error: unknown): unknown {
    if (error instanceof AssetServiceUnavailableException) {
      return new GraphQLError(error.message, {
        extensions: { code: GraphqlErrorCode.SERVICE_UNAVAILABLE },
        originalError: error,
      });
    }

    return error;
  }
}
