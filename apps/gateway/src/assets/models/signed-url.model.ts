import { Field, ObjectType } from '@nestjs/graphql';
import { DateTimeScalar } from '../../graphql/date-time.scalar';

@ObjectType('SignedUrl')
export class SignedUrlModel {
  @Field()
  url!: string;

  @Field(() => DateTimeScalar, { description: 'Ask again for a fresh URL after this instant.' })
  expiresAt!: number;
}
