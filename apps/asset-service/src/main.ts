import 'reflect-metadata';
import { existsSync } from 'node:fs';
import type { Server } from '@grpc/grpc-js';
import { NestFactory } from '@nestjs/core';
import { Transport, type MicroserviceOptions } from '@nestjs/microservices';
import { Logger } from 'nestjs-pino';
import { MESHDEX_ASSET_V1_PACKAGE_NAME } from '@meshdex/proto/asset/v1';
import { AppModule } from './app.module';
import { grpcConfig } from './config/config.namespaces';
import { grpcHealth } from './health/grpc-health';

/** Local development only — in Kubernetes the environment comes from ConfigMap/Secret. */
function loadLocalEnvFile(): void {
  if (existsSync('.env')) {
    process.loadEnvFile('.env');
  }
}

async function bootstrap(): Promise<void> {
  loadLocalEnvFile();

  const { url } = grpcConfig();

  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
    bufferLogs: true,
    transport: Transport.GRPC,
    options: {
      url,
      package: MESHDEX_ASSET_V1_PACKAGE_NAME,
      protoPath: require.resolve('@meshdex/proto/proto/meshdex/asset/v1/asset.proto'),
      // Must match ts-proto's options (buf.gen.yaml): a mismatch compiles and breaks at runtime.
      loader: {
        keepCase: false,
        longs: Number,
        defaults: true,
        oneofs: true,
      },
      // NestJS types `server` as `any`; it is the underlying @grpc/grpc-js Server.
      onLoadPackageDefinition: (_packageDefinition, server: Server) => {
        grpcHealth.addToServer(server);
      },
    },
  });

  app.useLogger(app.get(Logger));
  // SIGTERM → readiness off (HealthService) → in-flight calls finish → connections close.
  app.enableShutdownHooks();

  await app.listen();
}

bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`asset-service failed to start: ${message}\n`);
  process.exit(1);
});
