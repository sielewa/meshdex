import { Field, Float, ObjectType } from '@nestjs/graphql';
import { AssetModel } from '../../assets/models/asset.model';

@ObjectType('AssetSearchHit')
export class AssetSearchHitModel {
  @Field(() => AssetModel)
  asset!: AssetModel;

  @Field(() => Float, {
    description:
      'Cosine similarity in [-1, 1], higher is closer; comparable only within one model.',
  })
  score!: number;
}
