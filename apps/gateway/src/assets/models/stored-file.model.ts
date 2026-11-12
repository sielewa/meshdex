import { Field, Float, ObjectType } from '@nestjs/graphql';

/**
 * A stored file. The storage key stays internal; URLs are added once the media URL
 * strategy is implemented (ADR 010).
 */
@ObjectType('StoredFile')
export class StoredFileModel {
  /** Float, not Int: GraphQL Int is 32-bit and would overflow above 2 GiB. */
  @Field(() => Float, { description: 'Size in bytes (an integer; Float only to exceed 2^31).' })
  sizeBytes!: number;

  @Field()
  contentType!: string;
}
