import { getOverlayConfig } from '../constants';
import { random } from '$lib/utils';

export function createCutStore() {
  const maxCuts = 128; // TODO: config, but I want to refactor our configuration system first
  const shader = getOverlayConfig().cut.shader;
  let cutsIndex = $state<number>(-1);
  let videoActive = $state(false);
  let firstCutPending = false;
  const cutsSequenceStarted = $derived(cutsIndex >= 0);
  let subscribers: Array<(value: number) => void> = [];

  let animationTimer: ReturnType<typeof setInterval> | null = null;
  let sequenceTimer: ReturnType<typeof setTimeout> | null = null;
  let firstCutTimer: ReturnType<typeof setTimeout> | null = null;
  const animations: Array<{ slot: number; startedAt: number; durationMs: number }> = [];

  function updateAllSubscribers() {
    subscribers.forEach((subscriber) => subscriber(cutsIndex));
  }

  function uniformName(base: string, slot: number) {
    return slot === 0 ? base : `${base}${slot}`;
  }

  function reset(sender: WebSocket) {
    if (animationTimer) {
      clearInterval(animationTimer);
      animationTimer = null;
    }
    if (sequenceTimer) {
      clearTimeout(sequenceTimer);
      sequenceTimer = null;
    }
    if (firstCutTimer) {
      clearTimeout(firstCutTimer);
      firstCutTimer = null;
    }
    animations.length = 0;
    videoActive = false;
    firstCutPending = false;

    const parameters: Record<string, number> = {};
    for (let slot = 0; slot < maxCuts; slot += 1) {
      parameters[uniformName('angle', slot)] = 0;
      parameters[uniformName('offsetX', slot)] = 0;
      parameters[uniformName('offsetY', slot)] = 0;
      parameters[uniformName('animationProgress', slot)] = 0;
      parameters[uniformName('animationScale', slot)] = 0;
    }

    sender.send(JSON.stringify({ type: 'picom-shader', op: 'DISABLE', shader, parameters }));
  }

  function startAnimation(sender: WebSocket) {
    if (animationTimer) return;

    animationTimer = setInterval(() => {
      const now = performance.now();
      const parameters: Record<string, number> = {};
      const unfinishedAnimations: typeof animations = [];

      for (const animation of animations) {
        const progress = Math.min(
          1,
          Math.max(0, (now - animation.startedAt) / animation.durationMs)
        );
        parameters[uniformName('animationProgress', animation.slot)] = progress;
        if (progress < 1) unfinishedAnimations.push(animation);
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
    }, 1000 / 60);
  }

  function sendAnimatedCut(
    sender: WebSocket,
    idx: number,
    angle: number,
    offsetX: number,
    offsetY: number,
    animationScale: number,
    durationMs: number
  ) {
    sender.send(
      JSON.stringify({
        type: 'picom-shader',
        op: 'ENABLE',
        shader,
        parameters: {
          [uniformName('angle', idx)]: angle,
          [uniformName('offsetX', idx)]: offsetX,
          [uniformName('offsetY', idx)]: offsetY,
          [uniformName('animationProgress', idx)]: 0,
          [uniformName('animationScale', idx)]: animationScale
        }
      })
    );
    animations.push({ slot: idx, startedAt: performance.now(), durationMs });
    startAnimation(sender);
  }

  function doCut(sender: WebSocket) {
    if (firstCutPending) return;

    if (cutsIndex < 0) {
      firstCutPending = true;
      videoActive = true;
      sequenceTimer = setTimeout(() => {
        sequenceTimer = null;
        reset(sender);
        cutsIndex = -1;
        updateAllSubscribers();
      }, getOverlayConfig().cut.durationMs);

      firstCutTimer = setTimeout(() => {
        firstCutTimer = null;
        if (!firstCutPending) return;
        firstCutPending = false;
        addCut(sender);
      }, getOverlayConfig().cut.momentDelayMs);
      return;
    }

    addCut(sender);
  }

  function addCut(sender: WebSocket) {
    if (cutsIndex + 1 >= maxCuts) return;

    cutsIndex += 1;
    const currentIdx = cutsIndex;
    const angle = random() * 360;
    const offsetX = random() * 0.8 - 0.4;
    const offsetY = random() * 0.8 - 0.4;
    const animationScale = 0.04 + random() * 0.11;
    const animationDurationMs = (0.8 + random() * 2.7) * 1000;

    sendAnimatedCut(
      sender,
      currentIdx,
      angle,
      offsetX,
      offsetY,
      animationScale,
      animationDurationMs
    );
    updateAllSubscribers();
  }

  function finish(sender: WebSocket) {
    reset(sender);
    cutsIndex = -1;
    updateAllSubscribers();
  }

  function subscribe(subscription: (value: number) => void): () => void {
    subscribers.push(subscription);
    subscription(cutsIndex);
    return () => {
      subscribers = subscribers.filter((sub) => sub !== subscription);
    };
  }

  return {
    get cutsSequenceStarted() {
      return cutsSequenceStarted;
    },
    get cutsIndex() {
      return cutsIndex;
    },
    get videoActive() {
      return videoActive;
    },
    get hasCapacity() {
      return !firstCutPending && cutsIndex + 1 < maxCuts;
    },
    doCut,
    finish,
    resetUniforms: reset,
    subscribe
  };
}
