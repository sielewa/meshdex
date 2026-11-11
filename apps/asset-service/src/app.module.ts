import { Module } from '@nestjs/common';
import { ConfigModule, type ConfigType } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { buildLoggerParams } from '@meshdex/shared';
import { AssetsModule } from './assets/assets.module';
import { allConfigNamespaces, loggerConfig } from './config/config.namespaces';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // `.env` is loaded in main.ts (local only); here we only expose validated namespaces.
      ignoreEnvFile: true,
      load: allConfigNamespaces,
    }),
    LoggerModule.forRootAsync({
      inject: [loggerConfig.KEY],
      useFactory: (config: ConfigType<typeof loggerConfig>) =>
        buildLoggerParams({ serviceName: 'asset-service', ...config }),
    }),
    DatabaseModule,
    HealthModule,
    AssetsModule,
  ],
})
export class AppModule {}
