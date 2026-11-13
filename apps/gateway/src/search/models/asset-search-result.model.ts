import { Field, ObjectType } from '@nestjs/graphql';
import { AssetSearchHitModel } from './asset-search-hit.model';

/**
 * A ranked top-k list, not a connection (ADR 020): nearest-neighbour search has no stable
 * cursor, and the score belongs to each hit.
 */
@ObjectType('AssetSearchResult')
export class AssetSearchResultModel {
  @Field(() => [AssetSearchHitModel], { description: 'Best match first.' })
  hits!: AssetSearchHitModel[];

  @Field({ description: 'Model that ranked the hits, e.g. "ViT-B-32/laion2b_s34b_b79k".' })
  model!: string;
}
