/*
 * Plain values only (no three.js import): the asset page imports FADE_DURATION_MS, and three.js
 * must stay in the viewer's own chunk, downloaded only when a model is shown.
 */

/**
 * Where the camera looks from (normalised where used): front-right and a little above, close
 * to the three-quarter view of Poly Haven's renders, so the still image and the model it fades
 * into match roughly.
 */
export const VIEW_DIRECTION: readonly [number, number, number] = [0.6, 0.35, 1];

/** Space around the model's bounding sphere when framing it (1 = the sphere touches the edges). */
export const FRAME_MARGIN = 1.05;

/** Cross-fade from the still image to the model; the same value in both components. */
export const FADE_DURATION_MS = 400;
