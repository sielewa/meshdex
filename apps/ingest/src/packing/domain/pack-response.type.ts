/** A failed model is a normal response, so the worker keeps going. */
export type PackResponse =
  | { ok: true; glb: Uint8Array; warnings: string[] }
  | { ok: false; message: string; warnings: string[] };
