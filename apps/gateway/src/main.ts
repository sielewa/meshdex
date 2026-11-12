import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { httpConfig } from './config/config.namespaces';

/** Local development only — in Kubernetes the environment comes from the ConfigMap. */
function loadLocalEnvFile(): void {
  if (existsSync('.env')) {
    process.loadEnvFile('.env');
  }
}

async function bootstrap(): Promise<void> {
  loadLocalEnvFile();

  // Validates the whole environment before Nest starts: a misconfigured pod fails fast.
  const { port, corsOrigins } = httpConfig();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));
  app.disable('x-powered-by');
  app.enableCors({ origin: corsOrigins });
  // SIGTERM → readiness off (HealthService) → in-flight requests finish → server closes.
  app.enableShutdownHooks();

  await app.listen(port);
}

bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`gateway failed to start: ${message}\n`);
  process.exit(1);
});
