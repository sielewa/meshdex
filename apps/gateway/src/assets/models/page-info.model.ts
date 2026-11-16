import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType('PageInfo')
export class PageInfoModel {
  @Field(() => String, { nullable: true, description: 'Opaque cursor; null on the last page.' })
  endCursor!: string | null;

  @Field()
  hasNextPage!: boolean;
}
