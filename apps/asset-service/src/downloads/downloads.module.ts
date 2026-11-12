import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { DownloadsController } from './downloads.controller';
import { DownloadsService } from './downloads.service';
import { StoredOriginalsRepository } from './infrastructure/stored-originals.repository';

/** Read access to stored files through short-lived presigned URLs (ADR 010). */
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
