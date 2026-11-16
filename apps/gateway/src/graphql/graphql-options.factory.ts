import type { ApolloDriverConfig } from '@nestjs/apollo';
import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import type { GqlOptionsFactory } from '@nestjs/graphql';
import type { Request } from 'express';
import { GraphQLError, type GraphQLFormattedError } from 'graphql';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { AssetLoaderFactory } from '../assets/asset-loader.factory';
import { OriginalDownloadUrlLoaderFactory } from '../assets/original-download-url-loader.factory';
import { graphqlConfig } from '../config/config.namespaces';
import { GraphqlErrorCode } from './domain/graphql-error-code.enum';
import type { GraphqlContext } from './domain/graphql-context.interface';
import { MASKED_ERROR_MESSAGE } from './graphql.constants';

@Injectable()
export class GraphqlOptionsFactory implements GqlOptionsFactory<ApolloDriverConfig> {
  constructor(
    @Inject(graphqlConfig.KEY)
    private readonly config: ConfigType<typeof graphqlConfig>,
    private readonly assetLoaderFactory: AssetLoaderFactory,
    private readonly originalDownloadUrlLoaderFactory: OriginalDownloadUrlLoaderFactory,
    @InjectPinoLogger(GraphqlOptionsFactory.name)
    private readonly logger: PinoLogger,
  ) {}

  createGqlOptions(): ApolloDriverConfig {
    return {
      // In memory; a test keeps the committed schema.graphql in sync (ADR 011).
      autoSchemaFile: true,
      sortSchema: true,
      introspection: this.config.introspection,
      // The bundled GraphiQL page loads unpinned scripts from a public CDN.
      graphiql: false,
      includeStacktraceInErrorResponses: false,
      context: ({ req }: { req: Request }): GraphqlContext => ({
        req,
        assetLoader: this.assetLoaderFactory.create(),
        originalDownloadUrlLoader: this.originalDownloadUrlLoaderFactory.create(),
      }),
      formatError: (formattedError, error) => this.formatError(formattedError, error),
    };
  }

  /** The single place errors are logged. Unmapped errors reach clients only as a generic message. */
  private formatError(
    formattedError: GraphQLFormattedError,
    error: unknown,
  ): GraphQLFormattedError {
    const code = formattedError.extensions?.code;

    if (code === GraphqlErrorCode.SERVICE_UNAVAILABLE) {
      this.logger.warn(
        {
          err: this.originalError(error),
          path: formattedError.path,
        },
        'Upstream service unavailable',
      );
    }

    if (code !== GraphqlErrorCode.INTERNAL_SERVER_ERROR) {
      return formattedError;
    }

    this.logger.error(
      {
        err: this.originalError(error),
        path: formattedError.path,
      },
      'Unhandled GraphQL error',
    );

    return {
      message: MASKED_ERROR_MESSAGE,
      locations: formattedError.locations,
      path: formattedError.path,
      extensions: { code: GraphqlErrorCode.INTERNAL_SERVER_ERROR },
    };
  }

  /** The innermost error, whose `cause` chain pino prints. */
  private originalError(error: unknown): unknown {
    let current = error;

    while (current instanceof GraphQLError && current.originalError) {
      current = current.originalError;
    }

    return current;
  }
}
