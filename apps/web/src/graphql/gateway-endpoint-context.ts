'use client';

import { createContext } from 'react';

/** The public GraphQL endpoint, provided by the root layout from the server's runtime env. */
export const GatewayEndpointContext = createContext<string | null>(null);
