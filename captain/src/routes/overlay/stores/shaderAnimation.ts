/**
 * Drives shader animations over the picom bus: one ENABLE per tick carrying
 * `animationProgress<slot>` uniforms, so shaders animate by reading the
 * progress uniform (see 00-cut.glsl / 02-rotate.glsl).
 */
export function createShaderAnimator(shader: string) {
  type Animation = {
    slot: number;
    startedAt: number;
    durationMs: number;
    onComplete?: () => void;
  };

  let animationTimer: ReturnType<typeof setInterval> | null = null;
  const animations: Animation[] = [];

  function uniformName(base: string, slot: number) {
    return slot === 0 ? base : `${base}${slot}`;
  }

  function startAnimation(sender: WebSocket) {
    if (animationTimer) return;

    animationTimer = setInterval(() => {
      const now = performance.now();
      const parameters: Record<string, number> = {};
      const unfinishedAnimations: typeof animations = [];
      const completedAnimations: typeof animations = [];

      for (const animation of animations) {
        const progress = Math.min(
          1,
          Math.max(0, (now - animation.startedAt) / animation.durationMs)
        );
        parameters[uniformName('animationProgress', animation.slot)] = progress;
        if (progress < 1) unfinishedAnimations.push(animation);
        else completedAnimations.push(animation);
      }

      animations.splice(0, animations.length, ...unfinishedAnimations);
      if (Object.keys(parameters).length > 0) {
        sender.send(
          JSON.stringify({
            type: 'picom-shader',
            op: 'ENABLE',
            shader,
            parameters
          })
        );
      }

      if (animations.length === 0 && animationTimer) {
        clearInterval(animationTimer);
        animationTimer = null;
      }

      for (const animation of completedAnimations) animation.onComplete?.();
    }, 1000 / 60);
  }

  function animate(
    sender: WebSocket,
    slot: number,
    durationMs: number,
    parameters: Record<string, number>,
    onComplete?: () => void
  ) {
    sender.send(
      JSON.stringify({
        type: 'picom-shader',
        op: 'ENABLE',
        shader,
        parameters: {
          ...parameters,
          [uniformName('animationProgress', slot)]: 0
        }
      })
    );
    animations.push({ slot, startedAt: performance.now(), durationMs, onComplete });
    startAnimation(sender);
  }

  function clear() {
    if (animationTimer) {
      clearInterval(animationTimer);
      animationTimer = null;
    }
    animations.length = 0;
  }

  function reset(sender: WebSocket) {
    clear();
    sender.send(JSON.stringify({ type: 'picom-shader', op: 'DISABLE', shader }));
    sender.send(JSON.stringify({ type: 'picom-shader', op: 'CLEARSTATE', shader }));
  }

  return { animate, clear, reset, uniformName };
}
