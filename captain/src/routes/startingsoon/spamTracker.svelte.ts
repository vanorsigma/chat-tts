import {
  START_RATE,
  RATE_STEP,
  RATE_CAP,
  RATE_DECAY,
  SPAM_WINDOW_MS,
  SPAM_MIN_HITS_PER_SEC,
  DISC_COMPLETE_SUSTAIN_MS
} from './constants';
import type { ChatMessage } from '@twurple/chat';

interface SpamState {
  rate: number;
  discComplete: boolean;
  sustainedAtCapMs: number;
  secondsRemaining: number;
}

let sessionComplete = false;

const state = $state<SpamState>({
  rate: START_RATE,
  discComplete: false,
  sustainedAtCapMs: 0,
  secondsRemaining: 0
});

let hits: number[] = [];
let decayTimer: ReturnType<typeof setInterval> | null = null;
let sustainTimer: ReturnType<typeof setInterval> | null = null;
let onRateChange: ((rate: number) => void) | null = null;
let onDiscComplete: (() => void) | null = null;
let onCountdown: ((seconds: number) => void) | null = null;

function processDecay() {
  if (state.discComplete) return;
  const now = Date.now();
  hits = hits.filter((t) => now - t < SPAM_WINDOW_MS);
  if (hits.length < SPAM_MIN_HITS_PER_SEC) {
    const newRate = Math.max(START_RATE, state.rate - RATE_DECAY);
    if (newRate !== state.rate) {
      state.rate = newRate;
      onRateChange?.(state.rate);
      state.sustainedAtCapMs = 0;
      state.secondsRemaining = DISC_COMPLETE_SUSTAIN_MS / 1000;
    }
  }
}

function processSustain() {
  if (state.discComplete) return;
  if (state.rate >= RATE_CAP) {
    state.sustainedAtCapMs += 250;
    const remaining = Math.max(0, Math.ceil((DISC_COMPLETE_SUSTAIN_MS - state.sustainedAtCapMs) / 1000));
    state.secondsRemaining = remaining;
    onCountdown?.(remaining);
    if (state.sustainedAtCapMs >= DISC_COMPLETE_SUSTAIN_MS) {
      state.discComplete = true;
      sessionComplete = true;
      onDiscComplete?.();
    }
  }
}

export function createSpamTracker() {
  function start(): boolean {
    if (sessionComplete) {
      stop();
      return false;
    }
    state.rate = START_RATE;
    state.discComplete = false;
    state.sustainedAtCapMs = 0;
    state.secondsRemaining = DISC_COMPLETE_SUSTAIN_MS / 1000;
    hits = [];
    stop();
    decayTimer = setInterval(processDecay, 1000);
    sustainTimer = setInterval(processSustain, 250);
    return true;
  }

  function stop() {
    if (decayTimer !== null) {
      clearInterval(decayTimer);
      decayTimer = null;
    }
    if (sustainTimer !== null) {
      clearInterval(sustainTimer);
      sustainTimer = null;
    }
  }

  function handleMessage(msg: ChatMessage) {
    if (state.discComplete) return;
    const text = msg.text || '';
    if (!text.trim()) return;
    if (text.startsWith('%') || text.startsWith('~')) return;
    if (msg.userInfo.userName?.toLowerCase() === 'vanorgamma') return;
    if (msg.userInfo.badges.has('bot-badge')) return;

    hits.push(Date.now());
    const now = Date.now();
    hits = hits.filter((t) => now - t < SPAM_WINDOW_MS);
    if (hits.length >= SPAM_MIN_HITS_PER_SEC) {
      const newRate = Math.min(RATE_CAP, state.rate + RATE_STEP);
      if (newRate !== state.rate) {
        state.rate = newRate;
        onRateChange?.(state.rate);
      }
    }
  }

  function getRate() {
    return state.rate;
  }
  function isDiscComplete() {
    return state.discComplete;
  }

  function onRateChanged(cb: (rate: number) => void) {
    onRateChange = cb;
  }
  function onDiscCompleted(cb: () => void) {
    onDiscComplete = cb;
  }
  function onCountdownTick(cb: (seconds: number) => void) {
    onCountdown = cb;
  }

  return {
    start,
    stop,
    handleMessage,
    getRate,
    isDiscComplete,
    onRateChanged,
    onDiscCompleted,
    onCountdownTick
  };
}
