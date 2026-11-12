import { Field, Float, InputType } from '@nestjs/graphql';
import { ArrayMaxSize, IsInt, IsString, Min } from 'class-validator';

/**
 * Only shape is checked here. Title/tag rules, the accepted content type and the size
 * limit belong to asset-service (it owns them and reports violations as BAD_USER_INPUT),
 * so they can't drift between two copies.
 */
@InputType()
export class InitiateUploadInput {
  @Field()
  @IsString()
  title!: string;

  /** Generous cost bound only; asset-service enforces the real per-asset limit. */
  @Field(() => [String], { defaultValue: [] })
  @IsString({ each: true })
  @ArrayMaxSize(100)
  tags!: string[];

  @Field()
  @IsString()
  fileName!: string;

  @Field({ description: 'Only "model/gltf-binary" (.glb) is accepted.' })
  @IsString()
  contentType!: string;

  @Field(() => Float, { description: 'Exact file size in bytes.' })
  @IsInt()
  @Min(1)
  sizeBytes!: number;
}
