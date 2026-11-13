import Form from 'next/form';
import type { ReactNode } from 'react';
import { MAX_SEARCH_QUERY_LENGTH } from '@/features/assets/assets.constants';

/**
 * A GET form to `/search?q=…`: the query lives in the URL, so results can be linked, reloaded
 * and navigated with back/forward. `next/form` turns the submit into a client-side navigation
 * (and prefetches the route's loading state); without JavaScript it is a plain form.
 */
export function AssetSearchForm({
  defaultQuery = '',
  autoFocus = false,
}: {
  defaultQuery?: string;
  autoFocus?: boolean;
}): ReactNode {
  return (
    <Form action="/search" role="search" className="flex w-full max-w-md gap-2">
      <input
        type="search"
        name="q"
        defaultValue={defaultQuery}
        // A fresh search page focuses its own field; the header's field never steals focus.
        autoFocus={autoFocus}
        required
        maxLength={MAX_SEARCH_QUERY_LENGTH}
        placeholder="Search models, e.g. rusty barrel"
        aria-label="Search models"
        className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm placeholder:text-neutral-500 focus:border-neutral-400 focus:outline-none"
      />
      <button
        type="submit"
        className="rounded bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700"
      >
        Search
      </button>
    </Form>
  );
}
