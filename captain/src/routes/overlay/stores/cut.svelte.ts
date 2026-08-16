import { getOverlayConfig } from '../constants';
import { createShaderAnimator } from './shaderAnimation';
import { random } from '$lib/utils';

export function createCutStore() {
  const maxCuts = 128; // TODO: config, but I want to refactor our configuration system first
  const shader = getOverlayConfig().cutConfig.shader;
  const animator = createShaderAnimator(shader);
  let cutsIndex = $state<number>(-1);
  let videoActive = $state(false);
  let firstCutPending = false;
  const cutsSequenceStarted = $derived(cutsIndex >= 0);
  let subscribers: Array<(value: number) => void> = [];

  let sequenceTimer: ReturnType<typeof setTimeout> | null = null;
  let firstCutTimer: ReturnType<typeof setTimeout> | null = null;

  function updateAllSubscribers() {
    subscribers.forEach((subscriber) => subscriber(cutsIndex));
  }

  function reset(sender: WebSocket) {
    if (sequenceTimer) {
      clearTimeout(sequenceTimer);
      sequenceTimer = null;
    }
    if (firstCutTimer) {
      clearTimeout(firstCutTimer);
      firstCutTimer = null;
    }
    videoActive = false;
    firstCutPending = false;
    animator.reset(sender);
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
    animator.animate(sender, idx, durationMs, {
      [animator.uniformName('angle', idx)]: angle,
      [animator.uniformName('offsetX', idx)]: offsetX,
      [animator.uniformName('offsetY', idx)]: offsetY,
      [animator.uniformName('animationScale', idx)]: animationScale
    });
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
      }, getOverlayConfig().cutConfig.durationMs);

      firstCutTimer = setTimeout(() => {
        firstCutTimer = null;
        if (!firstCutPending) return;
        firstCutPending = false;
        addCut(sender);
      }, getOverlayConfig().cutConfig.momentDelayMs);
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
