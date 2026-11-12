import { Field, ObjectType } from '@nestjs/graphql';

/** Relay-style page info (ADR 009): pass `endCursor` as `after` to get the next page. */
@ObjectType('PageInfo')
export class PageInfoModel {
  @Field(() => String, { nullable: true, description: 'Opaque cursor; null on the last page.' })
  endCursor!: string | null;

  @Field()
  hasNextPage!: boolean;
}
