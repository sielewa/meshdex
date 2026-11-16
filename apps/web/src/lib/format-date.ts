const formatter = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** Fixed locale and zone: the user's could print different text than the server (hydration). */
export function formatDate(iso: string): string {
  return formatter.format(new Date(iso));
}
