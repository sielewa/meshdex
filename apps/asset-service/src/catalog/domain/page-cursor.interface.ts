/** Position of the last asset on a page: the keyset `(created_at, id)` of ListAssets. */
export interface PageCursor {
  createdAt: number;
  id: string;
}
