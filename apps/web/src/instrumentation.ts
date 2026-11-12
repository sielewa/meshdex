/**
 * Runs once when the Next.js server starts. Node-only work lives in `instrumentation-node.ts`
 * and is imported only for the Node.js runtime, so it never ends up in an Edge bundle.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerNode } = await import('./instrumentation-node');

    registerNode();
  }
}
