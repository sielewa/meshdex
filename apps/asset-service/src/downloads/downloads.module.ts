import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { DownloadsController } from './downloads.controller';
import { DownloadsService } from './downloads.service';
import { StoredOriginalsRepository } from './infrastructure/stored-originals.repository';

@Module({
  imports: [
    StorageModule,
  ],
  controllers: [
    DownloadsController,
  ],
  providers: [
    DownloadsService,
    StoredOriginalsRepository,
  ],
})
export class DownloadsModule {}
