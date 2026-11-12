import { Field, ID, ObjectType } from '@nestjs/graphql';
import { AssetStatus } from '../../clients/asset-service/domain/asset-status.enum';
import { DateTimeScalar } from '../../graphql/date-time.scalar';
import './asset-status.registration';
import { AssetVersionModel } from './asset-version.model';

/**
 * GraphQL shape of an asset. Resolvers return the domain `Asset` typed as this class, so
 * the compiler checks that the domain object has every field the schema promises.
 */
@ObjectType('Asset')
export class AssetModel {
  @Field(() => ID)
  id!: string;

  @Field()
  title!: string;

  @Field(() => [String])
  tags!: string[];

  @Field(() => AssetStatus, { description: 'Status of the current version.' })
  status!: AssetStatus;

  @Field(() => AssetVersionModel, { description: 'The version shown to users.' })
  currentVersion!: AssetVersionModel;

  @Field(() => DateTimeScalar)
  createdAt!: number;

  @Field(() => DateTimeScalar)
  updatedAt!: number;
}
