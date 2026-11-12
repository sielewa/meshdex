import { ApolloDriver, type ApolloDriverConfig } from '@nestjs/apollo';
import { Module } from '@nestjs/common';
import { ConfigModule, type ConfigType } from '@nestjs/config';
import { APP_PIPE } from '@nestjs/core';
import { GraphQLModule } from '@nestjs/graphql';
import { LoggerModule } from 'nestjs-pino';
import { buildLoggerParams } from '@meshdex/shared';
import { AssetsModule } from './assets/assets.module';
import { allConfigNamespaces, loggerConfig } from './config/config.namespaces';
import { DateTimeScalar } from './graphql/date-time.scalar';
import { GraphqlOptionsFactory } from './graphql/graphql-options.factory';
import { GraphqlValidationPipe } from './graphql/graphql-validation.pipe';
import { HealthModule } from './health/health.module';
import { UploadsModule } from './uploads/uploads.module';

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
          serviceName: 'gateway',
          ...config,
        }),
    }),
    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      imports: [
        AssetsModule,
      ],
      useClass: GraphqlOptionsFactory,
    }),
    HealthModule,
    AssetsModule,
    UploadsModule,
  ],
  providers: [
    DateTimeScalar,
    {
      provide: APP_PIPE,
      useClass: GraphqlValidationPipe,
    },
  ],
})
export class AppModule {}
