import { Catch } from '@nestjs/common';
import type { GqlExceptionFilter } from '@nestjs/graphql';

/**
 * Without it NestJS logs every `GraphQLError`, client errors included; logging happens once, in
 * `formatError`. Per resolver: a global filter would also swallow the HTTP health endpoints.
 */
@Catch()
export class GraphqlExceptionFilter implements GqlExceptionFilter {
  catch(exception: unknown): unknown {
    return exception;
  }
}
