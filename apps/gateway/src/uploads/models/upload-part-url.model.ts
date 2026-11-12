import { Field, Int, ObjectType } from '@nestjs/graphql';
import { DateTimeScalar } from '../../graphql/date-time.scalar';

@ObjectType('UploadPartUrl')
export class UploadPartUrlModel {
  @Field(() => Int, { description: '1-based, as in S3.' })
  partNumber!: number;

  @Field({
    description: 'Presigned PUT URL for this part; send the ETag header back on completion.',
  })
  url!: string;

  @Field(() => DateTimeScalar)
  expiresAt!: number;
}
