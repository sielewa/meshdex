import { Module } from '@nestjs/common';
import { ConfigModule, type ConfigType } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { buildLoggerParams } from '@meshdex/shared';
import { allConfigNamespaces, loggerConfig } from './config/config.namespaces';
import { FetchModule } from './fetch/fetch.module';
import { ImportModule } from './import/import.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // `.env` is loaded in main.ts (local only); here we only expose validated namespaces.
      ignoreEnvFile: true,
      load: allConfigNamespaces,
    }),
    LoggerModule.forRootAsync({
      inject: [
        loggerConfig.KEY,
      ],
      useFactory: (config: ConfigType<typeof loggerConfig>) =>
        buildLoggerParams({
          serviceName: 'ingest',
          ...config,
        }),
    }),
    FetchModule,
    ImportModule,
  ],
})
export class AppModule {}
