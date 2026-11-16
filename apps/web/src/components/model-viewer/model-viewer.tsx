'use client';

import { OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Suspense, useCallback, useState, type ReactNode } from 'react';
import { GltfModel } from '@/components/model-viewer/gltf-model';
import { LoadProgress } from '@/components/model-viewer/load-progress';
import { FADE_DURATION_MS } from '@/components/model-viewer/model-viewer.constants';
import { ViewerErrorBoundary } from '@/components/model-viewer/viewer-error-boundary';

/** Transparent until the model is framed, then fades in over the still image behind it. */
export function ModelViewer({
  url,
  onRetry,
  onLoaded,
}: {
  url: string;
  onRetry: () => void;
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
            // An idle viewer costs no GPU time.
            frameloop="demand"
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
            {/* No environment map: drei's presets come from a third-party CDN. */}
            <hemisphereLight args={['#ffffff', '#444444', 0.8]} />
            <directionalLight position={[5, 8, 5]} intensity={1.4} />
            <directionalLight position={[-4, 2, -3]} intensity={0.5} />
            <OrbitControls makeDefault rotateSpeed={0.4} zoomSpeed={0.2} />
          </Canvas>
        </div>
        <LoadProgress />
      </div>
    </ViewerErrorBoundary>
  );
}
