import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { AssetStatus } from '../../clients/asset-service/domain/asset-status.enum';
import { DateTimeScalar } from '../../graphql/date-time.scalar';
import './asset-status.registration';
import { ModelStatsModel } from './model-stats.model';
import { StoredFileModel } from './stored-file.model';
import { ThumbnailModel } from './thumbnail.model';

@ObjectType('AssetVersion')
export class AssetVersionModel {
  @Field(() => ID)
  id!: string;

  @Field(() => Int, { description: '1, 2, 3… per asset.' })
  number!: number;

  @Field(() => AssetStatus)
  status!: AssetStatus;

  @Field(() => StoredFileModel, { description: 'The file as uploaded.' })
  original!: StoredFileModel;

  @Field(() => StoredFileModel, { nullable: true, description: 'Set when READY.' })
  optimized!: StoredFileModel | null;

  @Field(() => [ThumbnailModel], { description: 'Empty until READY.' })
  thumbnails!: ThumbnailModel[];

  @Field(() => ModelStatsModel, { nullable: true, description: 'Set when READY.' })
  stats!: ModelStatsModel | null;

  @Field(() => String, { nullable: true, description: 'Set when FAILED; safe to show.' })
  failureReason!: string | null;

  @Field(() => DateTimeScalar)
  createdAt!: number;

  @Field(() => DateTimeScalar, { nullable: true, description: 'Set when READY or FAILED.' })
  processedAt!: number | null;
}
