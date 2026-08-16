import { getOverlayConfig } from '../constants';
import { createShaderAnimator } from './shaderAnimation';

export function createRotateStore() {
  const shader = getOverlayConfig().rotateConfig.shader;
  const animator = createShaderAnimator(shader);

  function doRotate(sender: WebSocket, angle: number, durationMs: number) {
    animator.clear();
    animator.animate(sender, 0, durationMs, { angle }, () => animator.reset(sender));
  }

  function finish(sender: WebSocket) {
    animator.reset(sender);
  }

  return { doRotate, finish };
}
