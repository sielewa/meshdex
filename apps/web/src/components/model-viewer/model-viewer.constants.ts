// No three.js import: the asset page imports this, and three.js must stay in the viewer's chunk.

/** Close to Poly Haven's three-quarter renders, so the still image and the model match. */
export const VIEW_DIRECTION: readonly [number, number, number] = [0.6, 0.35, 1];

/** 1 = the bounding sphere touches the edges. */
export const FRAME_MARGIN = 1.05;

export const FADE_DURATION_MS = 400;
