'use client';

import { useProgress } from '@react-three/drei';
import type { ReactNode } from 'react';

/**
 * Download progress of the model as a thin bar along the bottom edge: one fixed, quiet place
 * instead of text over the middle of the picture, which made loading look like flicker.
 * `useProgress` reads three.js' global loading manager, so it works outside `<Canvas>`; drei's
 * `<Html>` inside a Suspense fallback broke unmounting ("removeChild" errors) once the model
 * loaded. three.js computes the percentage from the response's Content-Length.
 */
export function LoadProgress(): ReactNode {
  const { active, progress } = useProgress();

  if (!active) {
    return null;
  }

  return (
    <div
      role="progressbar"
      aria-label="Loading model"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress)}
      className="pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-neutral-800"
    >
      <div
        className="h-full bg-neutral-400 transition-[width] duration-200"
        style={{ width: `${String(progress)}%` }}
      />
    </div>
  );
}
