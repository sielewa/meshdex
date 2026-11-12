'use client';

import { OrbitControls, Stage } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Suspense, type ReactNode } from 'react';
import { GltfModel } from '@/components/model-viewer/gltf-model';
import { LoadProgress } from '@/components/model-viewer/load-progress';
import { ViewerErrorBoundary } from '@/components/model-viewer/viewer-error-boundary';

/**
 * Interactive 3D preview of a GLB. Loaded with `next/dynamic` (no SSR) by the asset page,
 * so three.js is downloaded only by pages that show a model.
 */
export function ModelViewer({ url, onRetry }: { url: string; onRetry: () => void }): ReactNode {
  return (
    <ViewerErrorBoundary onRetry={onRetry}>
      <div className="relative h-full w-full">
        <Canvas
          // Render only when something changes (camera moved, model loaded) instead of 60 fps:
          // an idle viewer costs no GPU time.
          frameloop="demand"
          // Sharp on HiDPI screens without rendering 3x pixels on phones.
          dpr={[1, 2]}
          camera={{ fov: 45 }}
          fallback={
            <p className="p-6 text-sm text-neutral-400">WebGL is not available in this browser.</p>
          }
        >
          <Suspense fallback={null}>
            {/* `environment={null}`: drei's presets are HDR files from a public CDN. */}
            <Stage environment={null} intensity={0.6} adjustCamera={1.4}>
              <GltfModel url={url} />
            </Stage>
          </Suspense>
          <ambientLight intensity={0.5} />
          <directionalLight position={[5, 8, 5]} intensity={1.2} />
          <OrbitControls makeDefault />
        </Canvas>
        <LoadProgress />
      </div>
    </ViewerErrorBoundary>
  );
}
