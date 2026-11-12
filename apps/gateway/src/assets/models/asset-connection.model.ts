import { Field, ObjectType } from '@nestjs/graphql';
import { AssetModel } from './asset.model';
import { PageInfoModel } from './page-info.model';

/**
 * Connection without `edges` (ADR 009): asset-service pages with one cursor per page, not
 * per item. `edges { cursor node }` can be added later without breaking clients.
 */
@ObjectType('AssetConnection')
export class AssetConnectionModel {
  @Field(() => [AssetModel])
  nodes!: AssetModel[];

  @Field(() => PageInfoModel)
  pageInfo!: PageInfoModel;
}
