'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { GatewayEndpointContext } from '@/graphql/gateway-endpoint-context';
import { makeQueryClient } from '@/lib/make-query-client';

/**
 * Client-side context for the whole app. The QueryClient is created once per browser tab
 * (`useState` initializer), not per render, so the cache survives navigation.
 */
export function Providers({
  gatewayEndpoint,
  children,
}: {
  gatewayEndpoint: string;
  children: ReactNode;
}): ReactNode {
  const [queryClient] = useState(makeQueryClient);

  return (
    <GatewayEndpointContext value={gatewayEndpoint}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </GatewayEndpointContext>
  );
}
