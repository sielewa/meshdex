'use client';

import { useGLTF } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, type ReactNode } from 'react';
import { Box3, MathUtils, PerspectiveCamera, Sphere, Vector3 } from 'three';
import { FRAME_MARGIN, VIEW_DIRECTION } from '@/components/model-viewer/model-viewer.constants';

/** The part of OrbitControls this component sets; checked at runtime, see `orbitControls`. */
interface OrbitTarget {
  target: Vector3;
  minDistance: number;
  maxDistance: number;
  update: () => void;
}

/**
 * Loads a GLB, centres it and frames the camera on it. Suspends while downloading (the parent
 * shows progress), so the layout effect after mount runs with the model loaded.
 *
 * Framing is done here, once, instead of with drei's `<Stage>`/`<Bounds>`: those animate the
 * camera for up to a second after the model appears and measure their own helpers (lights,
 * shadow plane) together with the model, so the orbit centre moved with each model's
 * proportions. Here the model's bounding box centre is moved to the origin, the camera looks at
 * it from a fixed three-quarter direction, and OrbitControls orbit around the origin: the pivot
 * is always the middle of the model, and the first rendered frame is already the final view.
 *
 * `useGLTF(url, false)`: no Draco. drei's default decoder path is Google's CDN, a third-party
 * request this app doesn't make; Draco-compressed models fail with a readable error until
 * the decoder is served from our own origin (with the optimized models, Stage 2).
 */
export function GltfModel({ url, onLoaded }: { url: string; onLoaded?: () => void }): ReactNode {
  const gltf = useGLTF(url, false);
  // The live R3F state is read inside the effect: camera and controls are three.js objects that
  // are mutated on purpose, which React's rules forbid for values returned by a hook.
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

    // The bounding sphere must fit the narrower of the two field-of-view angles.
    const verticalHalf = MathUtils.degToRad(camera.fov) / 2;
    const horizontalHalf = Math.atan(Math.tan(verticalHalf) * (size.width / size.height));
    const distance =
      (bounds.radius / Math.sin(Math.min(verticalHalf, horizontalHalf))) * FRAME_MARGIN;

    camera.position
      .set(...VIEW_DIRECTION)
      .normalize()
      .multiplyScalar(distance);
    // Near and far follow the model's size, so tiny and huge models both render without clipping.
    camera.near = distance / 100;
    camera.far = distance * 100;
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();

    const orbit = orbitControls(controls);

    if (orbit) {
      orbit.target.set(0, 0, 0);
      // No zooming into the model (inside its bounding sphere) or out to a dot.
      orbit.minDistance = bounds.radius;
      orbit.maxDistance = distance * 4;
      orbit.update();
    }

    // Framed once per model (state is read, not subscribed to), so a resize keeps the user's
    // current view instead of resetting it.
    invalidate();
  }, [bounds, getState]);

  useEffect(() => {
    onLoaded?.();
  }, [onLoaded]);

  // The loader cache is keyed by URL, and every signed URL is new: without clearing, each
  // visit would keep another copy of the model (geometry and textures) in memory.
  useEffect(
    () => () => {
      useGLTF.clear(url);
    },
    [url],
  );

  // The scene object is cached by useGLTF, so it isn't moved itself: a group offsets it.
  return (
    <group position={[-bounds.center.x, -bounds.center.y, -bounds.center.z]}>
      <primitive object={gltf.scene} />
    </group>
  );
}

/** `state.controls` is typed loosely (any controls may be the default); this narrows it. */
function orbitControls(controls: unknown): OrbitTarget | null {
  return typeof controls === 'object' &&
    controls !== null &&
    'target' in controls &&
    controls.target instanceof Vector3 &&
    'update' in controls
    ? (controls as OrbitTarget)
    : null;
}
