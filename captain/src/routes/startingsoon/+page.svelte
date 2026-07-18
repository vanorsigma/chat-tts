<script lang="ts">
  import { onMount } from 'svelte';
  import type { SongData } from '$lib/songs/types';
  import { isSongControlMessage, isSongCompleteMessage } from '$lib/songs/messages';
  import { isFakerMessage } from '$lib/bus/messages';
  import { createFakeMessage } from '$lib/bus/fakeMessage';
  import { PUBLIC_TARGET_CHANNEL_ID } from '$env/static/public';
  import { createBus } from './bus';
  import { createTwitchClient } from './twitch';
  import { createAudioEngine } from '$lib/songs/audioEngine.svelte';
  import { createSpamTracker } from './spamTracker.svelte';
  import { handleCommand } from '$lib/songs/commands';
  import { installConsoleHijack } from './logger';
  import ArtistWidget from '$lib/songs/ArtistWidget.svelte';
  import Visualizer from './Visualizer.svelte';
  import { StartingSoonBulletContainer, type StartingSoonArtEntry } from './container';
  import { makeApplication } from '../overlay/utils';

  let channelName = $state('vanorsigma');
  let songQueue = $state<SongData[]>([]);
  let currentSong = $state<SongData | null>(null);
  let currentIndex = $state(0);
  let discSpinning = $state(false);
  let completeMessage = $state('');
  let showVisuals = $state(false);

  const audioEngine = createAudioEngine();
  const spamTracker = createSpamTracker();
  const bus = createBus();
  installConsoleHijack(bus.senderWs);

  let rotationDeg = $state(0);
  let currentRate = $state(0);
  let currentLetter = $state('');
  let remainingMs = $state(0);
  let progressPct = $state(0);
  let artistWidgetFlying = $state(false);

  let animFrame: number;

  let startingSoonImages: StartingSoonArtEntry[] = $state([]);
  let bulletDiv: HTMLDivElement;
  let bulletBackend: StartingSoonBulletContainer | null = null;
  let gameApplication: import('pixi.js').Application | null = null;
  let analyser: AnalyserNode | null = $state(null);
  let audioCtx: AudioContext | null = null;
  let previousSource: MediaElementAudioSourceNode | null = null;

  function loadSong(song: SongData) {
    currentSong = song;
    currentLetter = '';
    discSpinning = false;
    completeMessage = '';
    artistWidgetFlying = false;

    audioEngine.load(song.audioUrl, song.id);
    audioEngine.play();
    discSpinning = true;

    if (currentIndex === 0) {
      spamTracker.start();
      currentLetter = spamTracker.getTargetLetter();
    } else {
      spamTracker.stop();
      onRateChanged(1);
    }

    bus.sendState({
      type: 'song-state',
      songId: song.id,
      positionMs: 0,
      durationMs: audioEngine.getState().durationMs,
      rate: 0,
      playing: true,
      queueHead: songQueue[currentIndex]?.id ?? null,
      song
    });
  }

  function nextSong() {
    const curId = currentSong?.id;
    if (curId) {
      const idx = songQueue.findIndex((s) => s.id === curId);
      if (idx >= 0) {
        songQueue.splice(idx, 1);
        songQueue = [...songQueue];
        if (idx < songQueue.length) {
          currentIndex = idx;
          loadSong(songQueue[currentIndex]);
          return;
        }
      }
    }
    artistWidgetFlying = false;
    currentSong = null;
    discSpinning = false;
    completeMessage = '';
    audioEngine.unload();
    spamTracker.stop();
  }

  function onRateChanged(rate: number) {
    currentRate = rate;
    audioEngine.setRate(rate);
    bus.sendState({
      type: 'song-state',
      songId: currentSong?.id ?? null,
      positionMs: audioEngine.getState().positionMs,
      durationMs: audioEngine.getState().durationMs,
      rate,
      playing: audioEngine.getState().playing,
      queueHead: songQueue[currentIndex]?.id ?? null
    });
  }

  function onDiscComplete() {
    completeMessage = 'Stop spamming!';
    currentLetter = '';
    showVisuals = true;
    bus.sendSpamComplete({
      type: 'spam-complete',
      songId: currentSong?.id ?? '',
      elapsedMs: audioEngine.getState().positionMs
    });
    setTimeout(() => {
      completeMessage = '';
    }, 30000);
  }

  function animLoop() {
    if (discSpinning) {
      rotationDeg = (rotationDeg + currentRate * 2) % 360;
    }
    if (currentSong) {
      const pos = audioEngine.getState().positionMs;
      const dur = audioEngine.getState().durationMs || 1;
      remainingMs = Math.max(0, dur - pos);
      progressPct = Math.min(100, (pos / dur) * 100);
      if (!artistWidgetFlying && pos > 500) {
        artistWidgetFlying = true;
      }
    }
    animFrame = requestAnimationFrame(animLoop);
  }

  function setupAnalyser(audio: HTMLAudioElement) {
    if (previousSource) {
      previousSource.disconnect();
      previousSource = null;
    }
    if (!audioCtx) {
      audioCtx = new AudioContext();
    }
    try {
      const source = audioCtx.createMediaElementSource(audio);
      const analyserNode = audioCtx.createAnalyser();
      analyserNode.fftSize = 2048;
      source.connect(analyserNode);
      analyserNode.connect(audioCtx.destination);
      analyser = analyserNode;
      previousSource = source;
      audioCtx.resume();
    } catch {
      /* ignore */
    }
  }

  onMount(() => {
    console.log('StartingSoon initializing...');
    let twitchClient: ReturnType<typeof createTwitchClient>;

    (async () => {
      try {
        const chanRes = await fetch('/api/config/channel');
        const chanData = await chanRes.json();
        channelName = chanData.channelName ?? 'vanorsigma';
        console.log(`Channel config loaded: ${channelName}`);
      } catch {
        /* ignore */
      }

      try {
        const listRes = await fetch('/api/song/list');
        songQueue = await listRes.json();
        if (songQueue.length > 0) {
          currentIndex = 0;
        }
        console.log(`Song list loaded: ${songQueue.length} songs`);
      } catch {
        /* ignore */
      }

      try {
        const imgRes = await fetch('/api/config/startingsoon');
        const imgData = await imgRes.json();
        startingSoonImages = imgData.images ?? [];
        if (bulletBackend && startingSoonImages.length > 0) {
          bulletBackend.setImages(startingSoonImages);
        }
        console.log(`Starting soon images loaded: ${startingSoonImages.length}`);
      } catch {
        /* ignore */
      }

      twitchClient = createTwitchClient(channelName, (msg) => {
        spamTracker.handleMessage(msg);
        if (bulletBackend) {
          bulletBackend.onMessage(msg);
        }
      });
      console.log('Twitch client created');
    })();

    console.log('Spam tracker configured');
    spamTracker.onRateChanged(onRateChanged);
    spamTracker.onDiscCompleted(onDiscComplete);

    console.log('Audio engine progress tick registered');
    audioEngine.onProgressTick(() => {
      const s = audioEngine.getState();
      bus.sendState({
        type: 'song-state',
        songId: s.songId,
        positionMs: s.positionMs,
        durationMs: s.durationMs,
        rate: s.rate,
        playing: s.playing,
        queueHead: songQueue[currentIndex]?.id ?? null
      });
    });

    audioEngine.onLoad((audio) => setupAnalyser(audio));

    audioEngine.onSongEnded(() => {
      const songId = currentSong?.id;
      if (songId) {
        bus.sendSongComplete({
          type: 'song-complete',
          songId,
          elapsedMs: audioEngine.getState().durationMs
        });
      }
      if (currentIndex + 1 < songQueue.length) {
        currentIndex++;
        loadSong(songQueue[currentIndex]);
      } else {
        artistWidgetFlying = false;
        currentSong = null;
        discSpinning = false;
        completeMessage = '';
        audioEngine.unload();
        spamTracker.stop();
      }
    });

    console.log('Bus receiver WS handler attached');
    bus.receiverWs.onmessage = (data) => {
      try {
        const msg = JSON.parse(data);
        if (isSongControlMessage(msg)) {
          handleCommand(msg, {
            load: (song: SongData) => {
              songQueue = [song];
              currentIndex = 0;
              loadSong(song);
            },
            play: () => audioEngine.play(),
            pause: () => audioEngine.pause(),
            skip: () => nextSong(),
            seek: (ms: number) => audioEngine.seek(ms),
            setRate: () => {},
            setVolume: (v: number) => audioEngine.setVolume(v),
            loadQueue: (songs: SongData[]) => {
              songQueue = songs;
              const curId = currentSong?.id;
              if (curId) {
                const idx = songQueue.findIndex((s) => s.id === curId);
                if (idx >= 0) {
                  currentIndex = idx;
                  return;
                }
              }
              currentIndex = 0;
              if (songQueue[currentIndex]) loadSong(songQueue[currentIndex]);
            },
            removeFromQueue: (id: string) => {
              const idx = songQueue.findIndex((s) => s.id === id);
              if (idx < 0) return;
              songQueue.splice(idx, 1);
              songQueue = [...songQueue];
              if (idx <= currentIndex) {
                currentIndex = songQueue.findIndex((s) => s.id === currentSong?.id);
              }
            },
            reorderQueue: (from: number, to: number) => {
              const item = songQueue.splice(from, 1)[0];
              if (item) songQueue.splice(to, 0, item);
              songQueue = [...songQueue];
              currentIndex = songQueue.findIndex((s) => s.id === currentSong?.id);
            }
          });
        } else if (isFakerMessage(msg)) {
          spamTracker.handleMessage(
            createFakeMessage(msg.text, msg.displayName, PUBLIC_TARGET_CHANNEL_ID)
          );
        } else if (isSongCompleteMessage(msg) && msg.songId === currentSong?.id) {
          if (currentIndex + 1 < songQueue.length) {
            currentIndex++;
            loadSong(songQueue[currentIndex]);
          } else {
            artistWidgetFlying = false;
            currentSong = null;
            discSpinning = false;
            completeMessage = '';
            audioEngine.unload();
            spamTracker.stop();
          }
        }
      } catch {
        /* ignore */
      }
    };

    console.log('Animation loop starting');
    animLoop();

    (async () => {
      gameApplication = await makeApplication(bulletDiv);
      bulletBackend = new StartingSoonBulletContainer(gameApplication);
      if (startingSoonImages.length > 0) {
        bulletBackend.setImages(startingSoonImages);
      }
    })();

    return () => {
      console.log('StartingSoon cleaning up');
      cancelAnimationFrame(animFrame);
      audioEngine.unload();
      spamTracker.stop();
      twitchClient?.quit();
      bus.senderWs.close();
      bus.receiverWs.close();
      bulletBackend?.destroy();
      if (gameApplication) {
        gameApplication.destroy(true);
      }
      if (audioCtx) {
        audioCtx.close();
      }
    };
  });
</script>

<div class="startingsoon">
  <div class="visuals-layer" class:visible={showVisuals}>
    <Visualizer {analyser} />
    <div bind:this={bulletDiv} class="bullet-canvas"></div>
  </div>

  <div class="vinyl-container" class:spinning={discSpinning}>
    {#if currentSong}
      <div class="vinyl" style="transform: rotate({rotationDeg}deg)">
        <div class="vinyl-inner">
          <img src={currentSong.coverUrl} alt={currentSong.name} class="cover-art" />
        </div>
      </div>
    {:else}
      <div class="vinyl">
        <div class="vinyl-inner">
          <div class="no-song">Starting Soon</div>
        </div>
      </div>
    {/if}
  </div>

  {#if currentLetter}
    <div class="spam-letter">Spam "{currentLetter}"!</div>
  {/if}

  {#if completeMessage}
    <div class="complete-message">{completeMessage}</div>
  {/if}

  <div class="artist-widget-container">
    <ArtistWidget
      song={currentSong}
      rate={currentRate}
      {remainingMs}
      flying={artistWidgetFlying}
      {progressPct}
    />
  </div>
</div>

<style>
  .startingsoon {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Fredoka One', sans-serif;
  }

  .visuals-layer {
    position: absolute;
    inset: 0;
    z-index: 0;
    opacity: 0;
    transition: opacity 1s ease;
    pointer-events: none;
  }

  .visuals-layer.visible {
    opacity: 1;
  }

  .bullet-canvas {
    position: absolute;
    inset: 0;
  }

  .vinyl-container {
    position: relative;
    width: 80vmin;
    height: 80vmin;
    z-index: 2;
  }

  .vinyl {
    width: 80vmin;
    height: 80vmin;
    border-radius: 50%;
    background: radial-gradient(circle at 30% 30%, #444, #111 40%, #000 80%);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow:
      0 0 60px rgba(0, 0, 0, 0.8),
      0 0 120px rgba(59, 130, 246, 0.2);
    transition: box-shadow 0.5s ease;
  }

  .vinyl-container.spinning .vinyl {
    box-shadow:
      0 0 60px rgba(0, 0, 0, 0.8),
      0 0 120px rgba(59, 130, 246, 0.5);
  }

  .vinyl-inner {
    width: 40%;
    height: 40%;
    border-radius: 50%;
    overflow: hidden;
    border: 4px solid rgba(255, 255, 255, 0.2);
    background: #222;
  }

  .cover-art {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .no-song {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 3em;
  }

  .spam-letter {
    position: absolute;
    bottom: 22vmin;
    color: white;
    font-size: 3em;
    text-shadow: 0 0 20px rgba(59, 130, 246, 0.8);
    animation: pulse 2s ease-in-out infinite;
    z-index: 3;
  }

  @keyframes pulse {
    0%,
    100% {
      transform: scale(1);
      opacity: 0.8;
    }
    50% {
      transform: scale(1.1);
      opacity: 1;
    }
  }

  .complete-message {
    position: absolute;
    bottom: 22vmin;
    color: #ff6b6b;
    font-size: 2.5em;
    text-shadow: 0 0 20px rgba(255, 107, 107, 0.8);
    z-index: 3;
  }

  .artist-widget-container {
    position: absolute;
    bottom: 4vmin;
    right: 4vmin;
    z-index: 3;
  }
</style>
