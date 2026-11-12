import 'server-only';
import { cache } from 'react';
import { makeQueryClient } from './make-query-client';

/**
 * The QueryClient of the current server request: React's `cache` returns the same instance
 * to every server component rendering this request, and a new one for the next request,
 * so prefetched data is never shared between users.
 */
export const getServerQueryClient = cache(makeQueryClient);
