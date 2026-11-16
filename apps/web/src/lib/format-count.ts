const formatter = new Intl.NumberFormat('en-GB');

/** "12,345": fixed locale, so server and client render the same text (see `formatDate`). */
export function formatCount(value: number): string {
  return formatter.format(value);
}
