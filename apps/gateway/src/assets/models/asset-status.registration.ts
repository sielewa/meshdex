import { registerEnumType } from '@nestjs/graphql';
import { AssetStatus } from '../../clients/asset-service/domain/asset-status.enum';

// GraphQL uses the keys (READY), resolvers the values ('ready'). Imported for the side effect.
registerEnumType(AssetStatus, {
  name: 'AssetStatus',
  description: 'Lifecycle of an asset version: UPLOADING → UPLOADED → PROCESSING → READY | FAILED.',
});
