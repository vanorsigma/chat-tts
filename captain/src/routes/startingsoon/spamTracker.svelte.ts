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
  targetLetter: string;
  rate: number;
  discComplete: boolean;
  sustainedAtCapMs: number;
}

let state = $state<SpamState>({
  targetLetter: '',
  rate: START_RATE,
  discComplete: false,
  sustainedAtCapMs: 0
});

let hits: number[] = [];
let decayTimer: ReturnType<typeof setInterval> | null = null;
let sustainTimer: ReturnType<typeof setInterval> | null = null;
let onRateChange: ((rate: number) => void) | null = null;
let onDiscComplete: (() => void) | null = null;

function pickRandomLetter(): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return letters[Math.floor(Math.random() * letters.length)];
}

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
    }
  }
}

function processSustain() {
  if (state.discComplete) return;
  if (state.rate >= RATE_CAP) {
    state.sustainedAtCapMs += 250;
    if (state.sustainedAtCapMs >= DISC_COMPLETE_SUSTAIN_MS) {
      state.discComplete = true;
      onDiscComplete?.();
    }
  }
}

export function createSpamTracker() {
  function start() {
    state.targetLetter = pickRandomLetter();
    state.rate = START_RATE;
    state.discComplete = false;
    state.sustainedAtCapMs = 0;
    hits = [];
    stop();
    decayTimer = setInterval(processDecay, 1000);
    sustainTimer = setInterval(processSustain, 250);
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
    const letter = state.targetLetter.toLowerCase();
    let count = 0;
    for (const ch of text) {
      if (ch.toLowerCase() === letter) count++;
    }
    if (count > 0) {
      hits.push(Date.now());
      const now = Date.now();
      hits = hits.filter((t) => now - t < SPAM_WINDOW_MS);
      if (hits.length >= SPAM_MIN_HITS_PER_SEC) {
        const newRate = Math.min(RATE_CAP, state.rate + RATE_STEP * count);
        if (newRate !== state.rate) {
          state.rate = newRate;
          onRateChange?.(state.rate);
        }
      }
    }
  }

  function getTargetLetter() {
    return state.targetLetter;
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

  return {
    start,
    stop,
    handleMessage,
    getTargetLetter,
    getRate,
    isDiscComplete,
    onRateChanged,
    onDiscCompleted
  };
}
