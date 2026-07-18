import { SONG_PROGRESS_INTERVAL_MS } from './constants';

interface AudioState {
  songId: string | null;
  audio: HTMLAudioElement | null;
  playing: boolean;
  rate: number;
  volume: number;
  durationMs: number;
  positionMs: number;
}

const state = $state<AudioState>({
  songId: null,
  audio: null,
  playing: false,
  rate: 0,
  volume: 0.2,
  durationMs: 0,
  positionMs: 0
});

let progressInterval: ReturnType<typeof setInterval> | null = null;
let onProgress: (() => void) | null = null;
let onEnded: (() => void) | null = null;
let onLoadCb: ((audio: HTMLAudioElement) => void) | null = null;

function startProgressTracking() {
  stopProgressTracking();
  progressInterval = setInterval(() => {
    if (state.audio && !state.audio.paused) {
      state.positionMs = state.audio.currentTime * 1000;
      state.durationMs = state.audio.duration * 1000 || 0;
      onProgress?.();
    }
  }, SONG_PROGRESS_INTERVAL_MS);
}

function stopProgressTracking() {
  if (progressInterval !== null) {
    clearInterval(progressInterval);
    progressInterval = null;
  }
}

export function createAudioEngine() {
  function load(url: string, songId: string) {
    if (state.audio) {
      state.audio.pause();
      state.audio.src = '';
    }
    const audio = new Audio(url);
    audio.preload = 'auto';
    audio.preservesPitch = false;
    audio.volume = state.volume;
    audio.addEventListener('loadedmetadata', () => {
      state.durationMs = audio.duration * 1000;
      state.positionMs = 0;
    });
    audio.addEventListener('ended', () => {
      state.playing = false;
      stopProgressTracking();
      onEnded?.();
    });
    state.audio = audio;
    state.songId = songId;
    state.playing = false;
    state.rate = 0;
    state.positionMs = 0;
    state.durationMs = 0;
    onLoadCb?.(audio);
  }

  function play() {
    if (!state.audio) return;
    state.audio.playbackRate = state.rate;
    state.audio.play();
    state.playing = true;
    startProgressTracking();
  }

  function pause() {
    if (!state.audio) return;
    state.audio.pause();
    state.playing = false;
    stopProgressTracking();
  }

  function setRate(rate: number) {
    state.rate = rate;
    if (state.audio) {
      state.audio.playbackRate = rate;
    }
  }

  function seek(ms: number) {
    if (!state.audio) return;
    state.audio.currentTime = ms / 1000;
    state.positionMs = ms;
  }

  function unload() {
    if (state.audio) {
      state.audio.pause();
      state.audio.src = '';
    }
    state.audio = null;
    state.songId = null;
    state.playing = false;
    state.rate = 0;
    state.volume = 0.5;
    state.positionMs = 0;
    state.durationMs = 0;
    stopProgressTracking();
  }

  function setVolume(volume: number) {
    state.volume = Math.max(0, Math.min(1, volume));
    if (state.audio) {
      state.audio.volume = state.volume;
    }
  }

  function getState() {
    return state;
  }

  function onProgressTick(cb: () => void) {
    onProgress = cb;
  }

  function onSongEnded(cb: () => void) {
    onEnded = cb;
  }

  function getAudioElement() {
    return state.audio;
  }

  function onLoad(cb: (audio: HTMLAudioElement) => void) {
    onLoadCb = cb;
  }

  return {
    load,
    play,
    pause,
    setRate,
    setVolume,
    seek,
    unload,
    getState,
    onProgressTick,
    onSongEnded,
    getAudioElement,
    onLoad
  };
}
