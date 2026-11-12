'use client';

import { useProgress } from '@react-three/drei';
import type { ReactNode } from 'react';

/**
 * Download progress of the model as a plain DOM overlay next to the canvas. `useProgress`
 * reads three.js' global loading manager, so it works outside `<Canvas>`; drei's `<Html>`
 * inside a Suspense fallback broke unmounting ("removeChild" errors) once the model loaded.
 * three.js computes the percentage from the response's Content-Length.
 */
export function LoadProgress(): ReactNode {
  const { active, progress } = useProgress();

  if (!active) {
    return null;
  }

  return (
    <p
      role="status"
      className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-neutral-300"
    >
      Loading model… {progress.toFixed(0)}%
    </p>
  );
}
