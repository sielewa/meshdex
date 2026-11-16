import { Field, ObjectType } from '@nestjs/graphql';
import { AssetModel } from './asset.model';
import { PageInfoModel } from './page-info.model';

/** No `edges` (ADR 009): asset-service has one cursor per page; they can be added later. */
@ObjectType('AssetConnection')
export class AssetConnectionModel {
  @Field(() => [AssetModel])
  nodes!: AssetModel[];

  @Field(() => PageInfoModel)
  pageInfo!: PageInfoModel;
}
