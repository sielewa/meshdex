import { Field, ObjectType } from '@nestjs/graphql';
import { DateTimeScalar } from '../../graphql/date-time.scalar';

/** A presigned URL: grants access to one stored file until `expiresAt` (ADR 010). */
@ObjectType('SignedUrl')
export class SignedUrlModel {
  @Field()
  url!: string;

  @Field(() => DateTimeScalar, { description: 'Ask again for a fresh URL after this instant.' })
  expiresAt!: number;
}
