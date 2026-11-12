import { Catch } from '@nestjs/common';
import type { GqlExceptionFilter } from '@nestjs/graphql';

/**
 * Hands every resolver error to Apollo unchanged (graphql-js treats a returned `Error` as a
 * field error). Without it, NestJS's default handler logs every `GraphQLError` at `error`
 * level — including expected client errors such as BAD_USER_INPUT — and unexpected errors
 * would be logged twice. Logging happens once, in `GraphqlOptionsFactory.formatError`.
 * Applied per resolver with `@UseFilters`, because a global filter would also catch the
 * HTTP health endpoints, where returning the error sends no response.
 */
@Catch()
export class GraphqlExceptionFilter implements GqlExceptionFilter {
  catch(exception: unknown): unknown {
    return exception;
  }
}
