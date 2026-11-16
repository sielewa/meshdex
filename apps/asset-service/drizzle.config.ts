import { existsSync } from 'node:fs';
import { defineConfig } from 'drizzle-kit';

// Local development only; in CI/Kubernetes DATABASE_URL comes from the environment.
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is not set (copy .env.example to .env for local development)');
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/database/schema/index.ts',
  out: './drizzle',
  casing: 'snake_case',
  dbCredentials: { url: databaseUrl },
  strict: true,
  verbose: true,
});
