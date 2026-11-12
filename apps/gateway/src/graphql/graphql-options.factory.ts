import type { ApolloDriverConfig } from '@nestjs/apollo';
import { Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import type { GqlOptionsFactory } from '@nestjs/graphql';
import type { Request } from 'express';
import { GraphQLError, type GraphQLFormattedError } from 'graphql';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { AssetLoaderFactory } from '../assets/asset-loader.factory';
import { graphqlConfig } from '../config/config.namespaces';
import { GraphqlErrorCode } from './domain/graphql-error-code.enum';
import type { GraphqlContext } from './domain/graphql-context.interface';
import { MASKED_ERROR_MESSAGE } from './graphql.constants';

/** Apollo options for the GraphQL module: code-first schema, per-request context, error masking. */
@Injectable()
export class GraphqlOptionsFactory implements GqlOptionsFactory<ApolloDriverConfig> {
  constructor(
    @Inject(graphqlConfig.KEY)
    private readonly config: ConfigType<typeof graphqlConfig>,
    private readonly assetLoaderFactory: AssetLoaderFactory,
    @InjectPinoLogger(GraphqlOptionsFactory.name)
    private readonly logger: PinoLogger,
  ) {}

  createGqlOptions(): ApolloDriverConfig {
    return {
      // Schema built in memory from the decorated classes (no file writes at runtime);
      // the e2e test keeps the committed schema.graphql in sync with it (ADR 011).
      autoSchemaFile: true,
      sortSchema: true,
      introspection: this.config.introspection,
      // The bundled GraphiQL page loads unpinned scripts from a public CDN; explore the
      // API with any GraphQL client against /graphql instead.
      graphiql: false,
      includeStacktraceInErrorResponses: false,
      context: ({ req }: { req: Request }): GraphqlContext => ({
        req,
        assetLoader: this.assetLoaderFactory.create(),
      }),
      formatError: (formattedError, error) => this.formatError(formattedError, error),
    };
  }

  /**
   * The single place GraphQL errors are logged. Errors a resolver didn't map (bugs, broken
   * contracts, unexpected gRPC codes) reach clients only as INTERNAL_SERVER_ERROR with a
   * generic message, and the real error goes to the log with the request's context. An
   * unavailable asset-service is logged as a warning; client errors (BAD_USER_INPUT,
   * NOT_FOUND, CONFLICT) are not logged — the request log already records them.
   */
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

  /**
   * graphql-js wraps resolver errors (adding the path), and resolvers wrap domain exceptions;
   * the log needs the innermost error, whose `cause` chain pino prints.
   */
  private originalError(error: unknown): unknown {
    let current = error;

    while (current instanceof GraphQLError && current.originalError) {
      current = current.originalError;
    }

    return current;
  }
}
