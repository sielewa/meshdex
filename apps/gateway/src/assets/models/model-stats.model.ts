import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('ModelStats')
export class ModelStatsModel {
  @Field(() => Int)
  triangleCount!: number;

  @Field(() => Int)
  vertexCount!: number;

  @Field(() => Int)
  meshCount!: number;

  @Field(() => Int)
  textureCount!: number;
}
