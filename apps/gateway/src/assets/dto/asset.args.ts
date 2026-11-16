import { ArgsType, Field, ID } from '@nestjs/graphql';
import { IsUUID } from 'class-validator';

@ArgsType()
export class AssetArgs {
  /** One malformed id would fail the whole BatchGetAssets call that DataLoader shares. */
  @Field(() => ID)
  @IsUUID()
  id!: string;
}
