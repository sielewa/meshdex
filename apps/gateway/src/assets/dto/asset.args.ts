import { ArgsType, Field, ID } from '@nestjs/graphql';
import { IsUUID } from 'class-validator';

@ArgsType()
export class AssetArgs {
  /**
   * Checked here because asset-service's ids are UUIDs: one malformed id would otherwise
   * fail the whole BatchGetAssets call that DataLoader shares between fields.
   */
  @Field(() => ID)
  @IsUUID()
  id!: string;
}
