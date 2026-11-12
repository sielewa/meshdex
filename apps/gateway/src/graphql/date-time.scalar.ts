import { Scalar, type CustomScalar } from '@nestjs/graphql';
import { GraphQLError, Kind, type ValueNode } from 'graphql';

/**
 * `DateTime` as an ISO 8601 UTC string on the wire, epoch milliseconds in code (ADR 003).
 * Replaces the built-in `GraphQLISODateTime`, which serializes only `Date` objects and would
 * make every resolver convert times; this way the conversion happens once, at the boundary.
 */
@Scalar('DateTime')
export class DateTimeScalar implements CustomScalar<string, number> {
  description = 'UTC date-time in ISO 8601, e.g. 2026-11-12T09:54:33.123Z.';

  serialize(value: unknown): string {
    if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
      throw new GraphQLError('DateTime expects epoch milliseconds from the resolver');
    }

    return new Date(value).toISOString();
  }

  parseValue(value: unknown): number {
    if (typeof value !== 'string') {
      throw new GraphQLError('DateTime must be an ISO 8601 string');
    }

    return this.parseIso(value);
  }

  parseLiteral(ast: ValueNode): number {
    if (ast.kind !== Kind.STRING) {
      throw new GraphQLError('DateTime must be an ISO 8601 string');
    }

    return this.parseIso(ast.value);
  }

  private parseIso(value: string): number {
    const epochMs = Date.parse(value);

    if (Number.isNaN(epochMs)) {
      throw new GraphQLError('DateTime must be an ISO 8601 string');
    }

    return epochMs;
  }
}
