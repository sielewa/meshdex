'use client';

import { useContext } from 'react';
import { GatewayEndpointContext } from '@/graphql/gateway-endpoint-context';

/** Endpoint browsers send GraphQL requests to; throws outside `Providers` (a wiring bug). */
export function useGatewayEndpoint(): string {
  const endpoint = useContext(GatewayEndpointContext);

  if (endpoint === null) {
    throw new Error('useGatewayEndpoint() must be used inside <Providers>');
  }

  return endpoint;
}
