import { getServerEnv } from './config/server-env';

/** Exits: Next.js catches errors from `register()` and keeps serving 500s from a broken pod. */
export function registerNode(): void {
  try {
    getServerEnv();
  } catch (error) {
    process.stderr.write(
      `web failed to start: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exit(1);
  }
}
