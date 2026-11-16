import { Module } from '@nestjs/common';
import { MlServiceClientModule } from '../clients/ml-service/ml-service-client.module';
import { SearchResolver } from './search.resolver';

@Module({
  imports: [
    MlServiceClientModule,
  ],
  providers: [
    SearchResolver,
  ],
})
export class SearchModule {}
