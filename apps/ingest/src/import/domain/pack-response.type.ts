/**
 * Pack worker → main thread. A failed model is a normal response (the worker keeps going);
 * `warnings` carries the library's messages, logged by the main thread.
 */
export type PackResponse =
  | { ok: true; glb: Uint8Array; warnings: string[] }
  | { ok: false; message: string; warnings: string[] };
