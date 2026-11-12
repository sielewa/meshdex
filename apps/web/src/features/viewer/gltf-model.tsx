'use client';

import { useGLTF } from '@react-three/drei';
import { useEffect, type ReactNode } from 'react';

/**
 * Loads a GLB and adds its scene. Suspends while downloading (the parent shows progress).
 *
 * `useGLTF(url, false)`: no Draco. drei's default decoder path is Google's CDN, a third-party
 * request this app doesn't make; Draco-compressed models fail with a readable error until
 * the decoder is served from our own origin (with the optimized models, Stage 2).
 */
export function GltfModel({ url }: { url: string }): ReactNode {
  const gltf = useGLTF(url, false);

  // The loader cache is keyed by URL, and every signed URL is new: without clearing, each
  // visit would keep another copy of the model (geometry and textures) in memory.
  useEffect(
    () => () => {
      useGLTF.clear(url);
    },
    [url],
  );

  return <primitive object={gltf.scene} />;
}
