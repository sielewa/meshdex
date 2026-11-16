import { Field, Float, InputType } from '@nestjs/graphql';
import { ArrayMaxSize, IsInt, IsString, Min } from 'class-validator';

/** Only shape: asset-service owns the rules, so they can't drift between two copies. */
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
