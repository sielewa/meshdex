/** Node-only work is imported only for the Node.js runtime, so it stays out of Edge bundles. */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerNode } = await import('./instrumentation-node');

    registerNode();
  }
}
