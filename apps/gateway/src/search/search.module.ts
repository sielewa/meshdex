import { Module } from '@nestjs/common';
import { MlServiceClientModule } from '../clients/ml-service/ml-service-client.module';
import { SearchResolver } from './search.resolver';

/** Text search over assets; assets themselves come from the request's asset DataLoader. */
@Module({
  imports: [
    MlServiceClientModule,
  ],
  providers: [
    SearchResolver,
  ],
})
export class SearchModule {}
