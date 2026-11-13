'use client';

import { OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Suspense, useCallback, useState, type ReactNode } from 'react';
import { GltfModel } from '@/components/model-viewer/gltf-model';
import { LoadProgress } from '@/components/model-viewer/load-progress';
import { FADE_DURATION_MS } from '@/components/model-viewer/model-viewer.constants';
import { ViewerErrorBoundary } from '@/components/model-viewer/viewer-error-boundary';

/**
 * Interactive 3D preview of a GLB. Loaded with `next/dynamic` (no SSR) by the asset page,
 * so three.js is downloaded only by pages that show a model.
 *
 * The canvas stays transparent until the model is framed, then fades in, so whatever the page
 * shows behind it (a still image of the model) turns into the model instead of being swapped.
 */
export function ModelViewer({
  url,
  onRetry,
  onLoaded,
}: {
  url: string;
  onRetry: () => void;
  /** Called once the model is loaded and framed (e.g. to fade out a still image). */
  onLoaded?: () => void;
}): ReactNode {
  const [loaded, setLoaded] = useState(false);
  const handleLoaded = useCallback(() => {
    setLoaded(true);
    onLoaded?.();
  }, [onLoaded]);

  return (
    <ViewerErrorBoundary onRetry={onRetry}>
      <div className="relative h-full w-full">
        <div
          className="h-full w-full transition-opacity ease-out"
          style={{
            opacity: loaded ? 1 : 0,
            transitionDuration: `${String(FADE_DURATION_MS)}ms`,
          }}
        >
          <Canvas
            // Render only when something changes (camera moved, model loaded) instead of 60 fps:
            // an idle viewer costs no GPU time.
            frameloop="demand"
            // Sharp on HiDPI screens without rendering 3x pixels on phones.
            dpr={[1, 2]}
            camera={{ fov: 45 }}
            fallback={
              <p className="p-6 text-sm text-neutral-400">
                WebGL is not available in this browser.
              </p>
            }
          >
            <Suspense fallback={null}>
              <GltfModel url={url} onLoaded={handleLoaded} />
            </Suspense>
            {/*
              Lights fixed to the world, not scaled with the model: directional lights shine the
              same at any distance. No environment map: drei's presets are HDR files from a
              public CDN, a third-party request this app doesn't make.
            */}
            <hemisphereLight args={['#ffffff', '#444444', 0.8]} />
            <directionalLight position={[5, 8, 5]} intensity={1.4} />
            <directionalLight position={[-4, 2, -3]} intensity={0.5} />
            {/*
              Slower than the defaults (1.0): a small drag spun the model too far, and one wheel
              notch jumped from the framed view to right up close.
            */}
            <OrbitControls makeDefault rotateSpeed={0.4} zoomSpeed={0.2} />
          </Canvas>
        </div>
        <LoadProgress />
      </div>
    </ViewerErrorBoundary>
  );
}
