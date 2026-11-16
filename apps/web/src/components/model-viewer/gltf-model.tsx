'use client';

import { useGLTF } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, type ReactNode } from 'react';
import { Box3, MathUtils, PerspectiveCamera, Sphere, Vector3 } from 'three';
import { FRAME_MARGIN, VIEW_DIRECTION } from '@/components/model-viewer/model-viewer.constants';

interface OrbitTarget {
  target: Vector3;
  minDistance: number;
  maxDistance: number;
  update: () => void;
}

/**
 * Frames the model itself instead of drei's `<Stage>`/`<Bounds>`, which animate the camera and
 * measure their own helpers with the model, so the orbit centre drifted.
 *
 * No Draco: drei's default decoder comes from Google's CDN, a third-party request this app
 * doesn't make (roadmap Stage 2).
 */
export function GltfModel({ url, onLoaded }: { url: string; onLoaded?: () => void }): ReactNode {
  const gltf = useGLTF(url, false);
  // Read inside the effect: three.js objects are mutated, which React forbids for hook values.
  const getState = useThree((state) => state.get);

  const bounds = useMemo(() => {
    const sphere = new Box3().setFromObject(gltf.scene).getBoundingSphere(new Sphere());

    return {
      center: sphere.center,
      // A model with no geometry has an empty box; 1 keeps the camera maths finite.
      radius: sphere.radius > 0 ? sphere.radius : 1,
    };
  }, [gltf.scene]);

  useLayoutEffect(() => {
    const { camera, controls, size, invalidate } = getState();

    if (!(camera instanceof PerspectiveCamera)) {
      return;
    }

    const verticalHalf = MathUtils.degToRad(camera.fov) / 2;
    const horizontalHalf = Math.atan(Math.tan(verticalHalf) * (size.width / size.height));
    const distance =
      (bounds.radius / Math.sin(Math.min(verticalHalf, horizontalHalf))) * FRAME_MARGIN;

    camera.position
      .set(...VIEW_DIRECTION)
      .normalize()
      .multiplyScalar(distance);
    camera.near = distance / 100;
    camera.far = distance * 100;
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();

    const orbit = orbitControls(controls);

    if (orbit) {
      orbit.target.set(0, 0, 0);
      orbit.minDistance = bounds.radius;
      orbit.maxDistance = distance * 4;
      orbit.update();
    }

    // Read, not subscribed to, so a resize keeps the user's view.
    invalidate();
  }, [bounds, getState]);

  useEffect(() => {
    onLoaded?.();
  }, [onLoaded]);

  // The loader cache is keyed by URL and every signed URL is new, so each visit would leak a copy.
  useEffect(
    () => () => {
      useGLTF.clear(url);
    },
    [url],
  );

  // The scene is cached by useGLTF, so a group offsets it instead of moving it.
  return (
    <group position={[-bounds.center.x, -bounds.center.y, -bounds.center.z]}>
      <primitive object={gltf.scene} />
    </group>
  );
}

function orbitControls(controls: unknown): OrbitTarget | null {
  return typeof controls === 'object' &&
    controls !== null &&
    'target' in controls &&
    controls.target instanceof Vector3 &&
    'update' in controls
    ? (controls as OrbitTarget)
    : null;
}
