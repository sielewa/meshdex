import { getServerEnv } from './config/server-env';

/**
 * An invalid environment must stop the process: Next.js catches errors thrown from
 * `register()`, logs them and keeps serving (every request then fails with 500), so throwing
 * alone would leave a broken pod running. Exiting makes the pod crash at startup, where
 * Kubernetes reports it and never routes traffic to it.
 */
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
