import { registerEnumType } from '@nestjs/graphql';
import { AssetStatus } from '../../clients/asset-service/domain/asset-status.enum';

// Exposes the domain enum to the schema: GraphQL uses the keys (READY), resolvers the
// values ('ready'). Imported for this side effect by the models that use the enum.
registerEnumType(AssetStatus, {
  name: 'AssetStatus',
  description: 'Lifecycle of an asset version: UPLOADING → UPLOADED → PROCESSING → READY | FAILED.',
});
