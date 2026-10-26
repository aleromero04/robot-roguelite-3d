import type { PerspectiveCamera } from 'three';

/** Same world and renderer. Only the presentation camera moves, never gameplay. */
export function menuCamera(camera: PerspectiveCamera, time: number, aspect: number): void {
    camera.fov = aspect < 1.3 ? 54 : 42;
    camera.position.set(7.5 + Math.sin(time * .12) * .16, 12, 18.5);
    camera.lookAt(-3.8, .6, 1.2);
    camera.updateProjectionMatrix();
}
