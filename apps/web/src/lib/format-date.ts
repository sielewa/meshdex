const formatter = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/**
 * "12 Nov 2026" from an ISO timestamp. Fixed locale and time zone on purpose: the server
 * renders the HTML and the browser hydrates it; with the user's locale/zone the two could
 * print different text (e.g. around midnight), which React reports as a hydration error.
 */
export function formatDate(iso: string): string {
  return formatter.format(new Date(iso));
}
