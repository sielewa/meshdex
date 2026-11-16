import 'server-only';
import { cache } from 'react';
import { makeQueryClient } from '@/lib/make-query-client';

/** `cache` scopes it to one request, so prefetched data is never shared between users. */
export const getServerQueryClient = cache(makeQueryClient);
