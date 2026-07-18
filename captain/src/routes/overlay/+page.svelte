<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { ChatBulletContainer } from './chatbullet/container';
  import { createOverlayTwitchClient } from '$lib/twitch';
  import { StaticAuthProvider } from '@twurple/auth';
  import { ApiClient } from '@twurple/api';
  import { PUBLIC_TWITCH_APP_ID } from '$env/static/public';
  import {
    isSongStateMessage,
    isSongControlMessage,
    isSongCompleteMessage
  } from '$lib/songs/messages';
  import type { SongStateMessage } from '$lib/songs/messages';
  import type { SongData } from '$lib/songs/types';
  import { createAudioEngine } from '$lib/songs/audioEngine.svelte';
  import { handleCommand } from '$lib/songs/commands';
  import ArtistWidget from '$lib/songs/ArtistWidget.svelte';
  import {
    PUBLIC_BUS_URL,
    PUBLIC_RECEIVER_URL,
    PUBLIC_HEARTRATE_URL,
    PUBLIC_TWITCH_BOT_ID,
    PUBLIC_KIKI_API,
    PUBLIC_TARGET_CHANNEL_ID,
    PUBLIC_SE_URL
  } from '$env/static/public';
  import { OverlayDispatchers } from './dispatcher';
  import { getOverlayConfig, applyOverlayConfig } from './constants';
  import { Commands } from './commands';
  import {
    pollStore,
    predictionStore,
    flashbangStore,
    blackSilenceStore,
    maxwellStore,
    mistakeStore,
    showImageStore,
    playAudioStore,
    goodnightKissStore,
    createCheckInStore,
    createMakiStore,
    karmaStore,
    biddingStore,
    positionStore,
    pinStore,
    DEFAULT_POSITIONS
  } from './stores';
  import { startCaptchaLoop } from './captcha';
  import { Heartrate } from './heartrate';
  import { createAndStartCycler, type CyclerSnapshot } from './stock/cycler.svelte';
  import { DEFAULT_STOCK_ICON } from './stock/icons';
  import type { ChatClient } from '@twurple/chat';
  import { makeApplication, properRandom } from './utils';
  import { MaxwellContainer } from './maxwell';
  import { KarmaContainer } from './karma';
  import { ModelUpdater } from './modelupdater';
  import { TimeoutAnimation } from './timeoutanimation';
  import { buildSvgGraphFor } from './heartrateGraph';
  import { AudioPlayer } from './audioPlayer';
  import type { OverlayPositionsConfig } from '$lib/config';
  import { installFakerReceiver } from './fakerReceiver';
  import { installConsoleHijack } from './logger';
  import { isOverlayPositionsMessage } from '$lib/bus/messages';
  import { gambaStore } from './gamba/gamba.svelte';
  import GambaWheel from './gamba/GambaWheel.svelte';
  import { SubTracker } from './subTracker';

  let chatBulletContainer: HTMLDivElement;
  let heartrate = new Heartrate(PUBLIC_HEARTRATE_URL);

  let flashbangCount: number = $state(0);
  let blackSilenceCount: number = $state(0);
  let client: ChatClient | null = null;
  let chatBulletBackend: ChatBulletContainer | undefined = undefined;

  let blackSilenceBorder = $state(false);

  let captchaElement: HTMLDivElement;
  let captchaText: string | null = $state(null);
  let captchaTop = $state(0);
  let captchaLeft = $state(0);

  let mistakeCount = $state(0);

  let heartrateGraphParent: HTMLDivElement;
  let dispatchers: OverlayDispatchers | null = null;
  let commands: Commands | null = null;

  let currentMakiMessage: string = $state('');
  let currentMakiDuration: number = $state(0);
  let makiActivated: boolean = $state(false);
  let makiThinking: boolean = $state(false);
  let displayedMakiMessage: string = $state('');
  let makiRevealTimer: ReturnType<typeof setInterval> | null = null;
  let makiMeowAudio: HTMLAudioElement | null = null;
  let lastMakiMeowTime = 0;

  $effect(() => {
    const msg = currentMakiMessage;
    if (!msg) return;

    displayedMakiMessage = '';
    lastMakiMeowTime = 0;
    let index = 0;
    const textSpeed = getOverlayConfig().makiConfig.textSpeed;
    const intervalMs = Math.max(50, 1000 / textSpeed);

    makiRevealTimer = setInterval(() => {
      if (index < msg.length) {
        displayedMakiMessage += msg[index];
        index++;

        const now = Date.now();
        if (now - lastMakiMeowTime >= 50) {
          lastMakiMeowTime = now;
          try {
            if (!makiMeowAudio) {
              makiMeowAudio = new Audio('/meow.mp3');
            }
            makiMeowAudio.currentTime = 0;
            makiMeowAudio.play();
          } catch {
            // audio may fail to load
          }
        }
      } else {
        if (makiRevealTimer) {
          clearInterval(makiRevealTimer);
          makiRevealTimer = null;
        }
      }
    }, intervalMs);

    return () => {
      if (makiRevealTimer) {
        clearInterval(makiRevealTimer);
        makiRevealTimer = null;
      }
    };
  });

  let audioPlayer: AudioPlayer | undefined = undefined;

  let songAudioEngine: ReturnType<typeof createAudioEngine> | undefined = undefined;
  let overlayQueue: string[] = [];
  let queueIndex = 0;
  let wasPlayingBeforeSilence = false;
  let lastSentSongId: string | null = null;

  let overlaySong: SongData | null = $state(null);
  let overlaySongRate = $state(0.5);
  let overlaySongProgress = $state(0);
  let overlayRemainingMs = $state(0);
  let overlaySongFlying = $state(false);

  let currentPin = $state<{ username: string; text: string; kamoji: string; emoji: string } | null>(
    null
  );

  let cyclerSnapshot: CyclerSnapshot = $state({
    symbol: 'HEART',
    label: 'Heartrate',
    current: getOverlayConfig().model.initialHeartrate,
    history: []
  });

  const busWs = new WebSocket(PUBLIC_BUS_URL);
  installConsoleHijack(busWs);
  const ws = new WebSocket(PUBLIC_RECEIVER_URL);
  const checkInStore = createCheckInStore(ws);
  const makiStore = createMakiStore(ws);

  let pollDismissTimer: ReturnType<typeof setTimeout> | undefined = $state(undefined);
  let pollRemainingMs = $state(0);
  let pollProgressPct = $state(0);
  let pollTickInterval = $state<ReturnType<typeof setInterval> | undefined>(undefined);

  let predictionDismissTimer: ReturnType<typeof setTimeout> | undefined = $state(undefined);
  let predictionRemainingMs = $state(0);
  let predictionProgressPct = $state(0);
  let predictionTickInterval = $state<ReturnType<typeof setInterval> | undefined>(undefined);

  function clearPollTimers() {
    if (pollTickInterval !== undefined) {
      clearInterval(pollTickInterval);
      pollTickInterval = undefined;
    }
    if (pollDismissTimer !== undefined) {
      clearTimeout(pollDismissTimer);
      pollDismissTimer = undefined;
    }
  }

  function clearPredictionTimers() {
    if (predictionTickInterval !== undefined) {
      clearInterval(predictionTickInterval);
      predictionTickInterval = undefined;
    }
    if (predictionDismissTimer !== undefined) {
      clearTimeout(predictionDismissTimer);
      predictionDismissTimer = undefined;
    }
  }

  function startPollTick(startDate: string, endDate: string) {
    clearPollTimers();
    const end = new Date(endDate).getTime();
    const start = new Date(startDate).getTime();
    const total = end - start;
    function tick() {
      const now = Date.now();
      const remaining = Math.max(0, end - now);
      pollRemainingMs = remaining;
      pollProgressPct = total > 0 ? (1 - remaining / total) * 100 : 0;
    }
    tick();
    pollTickInterval = setInterval(tick, 200);
  }

  function startPredictionTick(startDate: string, endDate: string) {
    clearPredictionTimers();
    const end = new Date(endDate).getTime();
    const start = new Date(startDate).getTime();
    const total = end - start;
    function tick() {
      const now = Date.now();
      const remaining = Math.max(0, end - now);
      predictionRemainingMs = remaining;
      predictionProgressPct = total > 0 ? (1 - remaining / total) * 100 : 0;
    }
    tick();
    predictionTickInterval = setInterval(tick, 200);
  }

  ws.addEventListener('message', (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'poll-update') {
        const poll = {
          id: data.id,
          title: data.title,
          options: data.options?.map(
            (o: { id: string; name: string; votes: number; channelPoints?: number }) => ({
              id: o.id,
              name: o.name,
              votes: o.votes ?? 0,
              channelPoints: o.channelPoints ?? 0
            })
          ),
          totalVotes: data.totalVotes,
          status: data.status,
          startDate: data.startDate,
          endDate: data.endDate
        };
        pollStore.set(poll);
        if (data.status === 'active') {
          startPollTick(data.startDate, data.endDate);
        } else {
          clearPollTimers();
          schedulePollDismiss();
        }
      } else if (data.type === 'prediction-update') {
        const prediction = {
          id: data.id,
          title: data.title,
          outcomes: data.outcomes?.map(
            (o: {
              id: string;
              name: string;
              channelPoints: number;
              voters: number;
              color?: string;
            }) => ({
              id: o.id,
              name: o.name,
              channelPoints: o.channelPoints ?? 0,
              voters: o.voters ?? 0,
              color: o.color
            })
          ),
          status: data.status,
          winningOutcomeId: data.winningOutcomeId,
          startDate: data.startDate,
          endDate: data.endDate
        };
        predictionStore.set(prediction);
        if (data.status === 'active') {
          startPredictionTick(data.startDate, data.endDate);
        } else {
          clearPredictionTimers();
          schedulePredictionDismiss();
        }
      } else if (data.type === 'karma-update') {
        karmaStore.updateKarma(data.amount, data.label);
      }
    } catch {
      // ignore malformed messages
    }
  });

  function schedulePollDismiss() {
    clearPollTimers();
    pollDismissTimer = setTimeout(() => {
      pollStore.set(null);
      pollRemainingMs = 0;
      pollProgressPct = 100;
    }, 5000);
  }

  function schedulePredictionDismiss() {
    clearPredictionTimers();
    predictionDismissTimer = setTimeout(() => {
      predictionStore.set(null);
      predictionRemainingMs = 0;
      predictionProgressPct = 100;
    }, 5000);
  }

  function formatDuration(ms: number): string {
    if (ms <= 0) return '';
    const totalSec = Math.ceil(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  }

  function onShowImageLoad(event: Event) {
    const target = event.target;
    if (!(target as HTMLImageElement).naturalWidth || !(target as HTMLImageElement).naturalHeight)
      return;

    const imgTarget = target as HTMLImageElement;
    const style = getComputedStyle(chatBulletContainer);

    const { width, height } = style;

    const fullWidthNo = Number(width.replace('px', ''));
    const fullHeightNo = Number(height.replace('px', ''));

    const { naturalWidth, naturalHeight } = imgTarget;
    const targetWidth = Math.max(properRandom(), 0.5) * Math.min(Math.max(naturalWidth, 80), 500);
    const targetHeight = (naturalHeight / naturalWidth) * targetWidth;

    imgTarget.style.left = `${properRandom() * (fullWidthNo - targetWidth)}px`;
    imgTarget.style.top = `${properRandom() * (fullHeightNo - targetHeight)}px`;
    imgTarget.style.width = `${targetWidth}px`;
    imgTarget.style.height = `${targetHeight}px`;
  }

  let maxwellContainerInstance: MaxwellContainer | undefined = undefined;

  onMount(async () => {
    console.log('Initializing...');
    try {
      const res = await fetch('/api/config');
      const rawConfig = await res.json();
      console.log(`Applying overlay config...`);
      if (res.ok) {
        applyOverlayConfig(rawConfig);
        if (rawConfig.overlayPositionsConfig) {
          const src = rawConfig.overlayPositionsConfig as OverlayPositionsConfig;
          positionStore.set({ ...DEFAULT_POSITIONS, ...src });
        }
      }
      installFakerReceiver(
        ws,
        PUBLIC_TARGET_CHANNEL_ID,
        () => dispatchers,
        () => commands,
        (fake) => dispatchers?.dispatchMessage(fake)
      );
    } catch (e) {
      console.warn('Failed to load config:', e);
    }

    let channelName = 'vanorsigma';
    try {
      const chanRes = await fetch('/api/config/channel');
      const chanData = await chanRes.json();
      channelName = chanData.channelName ?? 'vanorsigma';
    } catch {
      /* ignore */
    }

    ws.addEventListener('message', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        if (isSongStateMessage(data)) {
          const ss = data;
          if (ss.song) overlaySong = ss.song;
          else if (ss.songId === null) overlaySong = null;
          overlaySongRate = ss.rate;
          overlaySongProgress = (ss.positionMs / ss.durationMs) * 100;
          overlayRemainingMs = Math.max(0, ss.durationMs - ss.positionMs);
          if (ss.songId && ss.positionMs > 500) overlaySongFlying = true;
          if (!ss.songId) overlaySongFlying = false;
        }
        if (isOverlayPositionsMessage(data)) {
          positionStore.set({ ...DEFAULT_POSITIONS, ...data.positions });
        }
        if (isSongCompleteMessage(data) && overlaySong && data.songId === overlaySong.id) {
          if (queueIndex + 1 < overlayQueue.length) {
            queueIndex++;
            songAudioEngine!.load(
              `/api/song/audio/${overlayQueue[queueIndex]}`,
              overlayQueue[queueIndex]
            );
            songAudioEngine!.play();
          } else {
            songAudioEngine!.unload();
            overlayQueue = [];
            queueIndex = 0;
            overlaySong = null;
            overlaySongFlying = false;
          }
        }
        const engine = songAudioEngine;
        if (isSongControlMessage(data) && engine) {
          handleCommand(data, {
            load: (song: SongData) => {
              overlayQueue = [song.id];
              queueIndex = 0;
              overlaySong = song;
              engine.load(song.audioUrl, song.id);
            },
            play: () => {
              console.log('Audio engine is going to play');
              engine.setRate(1.0); // NOTE: by default, this is 0
              engine.play();
            },
            pause: () => {
              console.log('Audio engine is going to pause');
              engine.pause();
            },
            skip: (skippedSongId, nextSong) => {
              if (skippedSongId) {
                const i = overlayQueue.indexOf(skippedSongId);
                if (i >= 0) {
                  overlayQueue.splice(i, 1);
                  overlayQueue = [...overlayQueue];
                }
                if (overlaySong) {
                  busWs.send(
                    JSON.stringify({
                      type: 'song-complete',
                      songId: skippedSongId,
                      elapsedMs: engine.getState().positionMs
                    })
                  );
                }
              }
              if (nextSong) {
                overlaySong = nextSong;
                overlaySongFlying = true;
                queueIndex = Math.max(0, overlayQueue.indexOf(nextSong.id));
                engine.load(nextSong.audioUrl, nextSong.id);
                engine.setRate(1.0);
                engine.play();
              } else {
                engine.unload();
                overlayQueue = [];
                queueIndex = 0;
                overlaySong = null;
                overlaySongFlying = false;
              }
            },
            seek: (ms: number) => engine.seek(ms),
            setRate: (rate: number) => engine.setRate(rate),
            setVolume: (volume: number) => engine.setVolume(volume),
            loadQueue: (songs: SongData[]) => {
              overlayQueue = songs.map((s) => s.id);
              const curId = overlaySong?.id;
              if (curId) {
                const idx = overlayQueue.indexOf(curId);
                if (idx >= 0) {
                  queueIndex = idx;
                  if (songs[idx]) overlaySong = songs[idx];
                  return;
                }
              }
              queueIndex = 0;
              overlaySong = songs[0] ?? null;
              if (overlayQueue[0]) {
                engine.load(songs[0].audioUrl, overlayQueue[0]);
              }
            },
            removeFromQueue: (songId: string) => {
              const idx = overlayQueue.indexOf(songId);
              if (idx < 0) return;
              overlayQueue.splice(idx, 1);
              overlayQueue = [...overlayQueue];
              if (idx <= queueIndex) {
                queueIndex = Math.max(0, queueIndex - (idx < queueIndex ? 1 : 0));
              }
            },
            reorderQueue: (fromIndex: number, toIndex: number) => {
              const item = overlayQueue.splice(fromIndex, 1)[0];
              if (item) overlayQueue.splice(toIndex, 0, item);
              overlayQueue = [...overlayQueue];
              const newIdx = overlayQueue.indexOf(overlaySong?.id ?? '');
              if (newIdx >= 0) queueIndex = newIdx;
            }
          });
        }
      } catch {
        /* ignore */
      }
    });

    const modelUpdater = new ModelUpdater();
    const twitchClient = createOverlayTwitchClient(channelName);
    client = twitchClient.client;
    console.log('Twitch client created');

    heartrate.subscribe((hr: number) => {
      if (hr < getOverlayConfig().model.blushHrThreshold) {
        modelUpdater.hideBlendShape('Blush');
      } else {
        modelUpdater.showBlendShape('Blush');
      }
      if (hr < getOverlayConfig().model.despairHrThreshold) {
        modelUpdater.showBlendShape('Despair');
      } else {
        modelUpdater.hideBlendShape('Despair');
      }
    });

    const cycler = createAndStartCycler();
    cycler.subscribe((snap) => {
      cyclerSnapshot = snap;
      const graph = buildSvgGraphFor(snap.history);
      if (!graph) return;
      heartrateGraphParent.innerHTML = '';
      heartrateGraphParent.appendChild(graph);
    });

    let gameApplication = await makeApplication(chatBulletContainer);
    console.log('Pixi application ready');
    const botTokenRes = await fetch('/api/twitch/bot-token');
    if (!botTokenRes.ok) {
      throw new Error('Failed to load bot token. Run `npx tsx authflow.ts bot` first.');
    }
    const botToken = await botTokenRes.json();
    const botAuthProvider = new StaticAuthProvider(
      PUBLIC_TWITCH_APP_ID,
      botToken.accessToken,
      botToken.scope
    );
    let apiClient = new ApiClient({ authProvider: botAuthProvider });

    dispatchers = new OverlayDispatchers(client, apiClient, modelUpdater, PUBLIC_TWITCH_BOT_ID);
    console.log('Dispatchers created');

    maxwellContainerInstance = new MaxwellContainer(gameApplication);
    chatBulletBackend = new ChatBulletContainer(dispatchers, PUBLIC_KIKI_API, gameApplication);
    console.log('Chat bullet container created');
    const _ = new KarmaContainer(dispatchers, gameApplication, karmaStore.updateKarma);
    console.log('Karma container created');
    let _timeout = new TimeoutAnimation(dispatchers, gameApplication);
    commands = new Commands(dispatchers);
    commands.setBusSocket(busWs);
    dispatchers.addObserver(commands);
    let _subTracker = new SubTracker(dispatchers);
    twitchClient.connect();
    console.log('Twitch connected');

    audioPlayer = new AudioPlayer(dispatchers);
    audioPlayer.start();

    songAudioEngine = createAudioEngine();
    songAudioEngine.onProgressTick(() => {
      const s = songAudioEngine!.getState();
      const songChanged = s.songId !== lastSentSongId;
      const msg: SongStateMessage = {
        type: 'song-state',
        songId: s.songId,
        positionMs: s.positionMs,
        durationMs: s.durationMs,
        rate: s.rate,
        playing: s.playing,
        queueHead: overlayQueue[0] ?? null,
        ...(songChanged && overlaySong ? { song: overlaySong } : {})
      };
      lastSentSongId = s.songId;
      busWs.send(JSON.stringify(msg));
    });
    songAudioEngine.onSongEnded(() => {
      if (overlaySong) {
        busWs.send(
          JSON.stringify({
            type: 'song-complete',
            songId: overlaySong.id,
            elapsedMs: songAudioEngine!.getState().durationMs
          })
        );
      }
      if (queueIndex + 1 < overlayQueue.length) {
        queueIndex++;
        songAudioEngine!.load(
          `/api/song/audio/${overlayQueue[queueIndex]}`,
          overlayQueue[queueIndex]
        );
        songAudioEngine!.play();
      } else {
        songAudioEngine!.unload();
        overlayQueue = [];
        queueIndex = 0;
        overlaySong = null;
        overlaySongFlying = false;
      }
    });
    songAudioEngine.play();

    startCaptchaLoop(
      dispatchers,
      captchaElement,
      (val) => (captchaText = val),
      (top, left) => {
        captchaTop = top;
        captchaLeft = left;
      }
    );

    makiStore.subscribe((message, duration, activated, thinking) => {
      currentMakiMessage = message;
      currentMakiDuration = duration;
      makiActivated = activated;
      makiThinking = thinking;
    });

    pinStore.subscribe((pin) => {
      currentPin = pin;
    });

    maxwellStore.subscribe(async (_maxwellCount: number) => {
      await maxwellContainerInstance?.spawnMaxwell(getOverlayConfig().maxwell.cooldownMs);
    });
  });

  onDestroy(() => {
    songAudioEngine?.unload();
  });

  function onFlashbangDone() {
    flashbangCount = flashbangStore.count;
  }

  function onBlackSilenceStart() {
    chatBulletBackend?.deleteAllBullets();
    chatBulletBackend?.setEnabled(false);
    audioPlayer?.pauseAll();
    wasPlayingBeforeSilence = songAudioEngine?.getState().playing ?? false;
    songAudioEngine?.pause();
    blackSilenceBorder = true;
    playAudioStore.purge();
    showImageStore.purge();
    maxwellContainerInstance?.removeAllMaxwells();

    setTimeout(() => {
      chatBulletBackend?.setEnabled(true);
      blackSilenceBorder = false;
      if (wasPlayingBeforeSilence) {
        songAudioEngine?.play();
        wasPlayingBeforeSilence = false;
      }
    }, getOverlayConfig().blackSilence.durationMs);
  }

  function onBlackSilenceDone() {
    blackSilenceCount = blackSilenceStore.count;
  }

  function onMistakeDone() {
    mistakeCount = mistakeStore.count;
  }
</script>

<div class="overlay">
  <div
    class="overlay-artist-widget"
    style="left: {$positionStore.artistWidgetX}px; top: {$positionStore.artistWidgetY}px;"
  >
    <ArtistWidget
      song={overlaySong}
      rate={overlaySongRate}
      remainingMs={overlayRemainingMs}
      flying={overlaySongFlying}
      progressPct={overlaySongProgress}
    />
  </div>
  <iframe class="streamelements" src={PUBLIC_SE_URL} title="streamelements"> </iframe>

  {#if makiActivated}
    <div class="makiShared">
      <img src="/maki.png" alt="cute bratty cat" />
    </div>
  {/if}

  {#if makiThinking}
    <div class="makiShared">
      <img src="/loading.webp" alt="loading" />
    </div>
  {/if}

  {#if currentMakiDuration > 0}
    <div class="makiShared">
      <div class="makiOutput">
        <div class="makiCountdown">{currentMakiDuration}</div>
        <p>{displayedMakiMessage}</p>
      </div>
    </div>
  {/if}
  {#if currentPin}
    <div class="pinnedMessage" style="left: {$positionStore.pinX}px; top: {$positionStore.pinY}px;">
      <span class="pinUser">{currentPin.username}</span>
      <span class="pinText">{currentPin.text}</span>
      <span class="pinKiki">{currentPin.kamoji} {currentPin.emoji}</span>
    </div>
  {/if}
  <div
    bind:this={captchaElement}
    class="captcha"
    style="top: {captchaTop}px; left: {captchaLeft}px; visibility: {captchaText
      ? 'visible'
      : 'hidden'}"
  >
    <span style="font-size: 5em">{captchaText}</span>
  </div>
  {#if blackSilenceBorder}
    <div class="blackSilenceBorder"></div>
  {/if}
  {#if blackSilenceCount < blackSilenceStore.count}<div class="fullscreenvideo blacksilence">
      <!-- svelte-ignore a11y_media_has_caption -->
      <video autoplay onended={onBlackSilenceDone} onplaying={onBlackSilenceStart}>
        <source src="/blacksilence.webm" /> Video tag smile
      </video>
    </div>{/if}
  {#if $checkInStore.length !== 0}
    <div class="checkInRedeems">
      <h1>Starting Soon Check Ins (next time show up on time HAH)</h1>
      {#each $checkInStore as checkInObject}
        <p>{checkInObject.username}: {checkInObject.message}</p>
      {/each}
    </div>
  {/if}
  {#if $goodnightKissStore.username}
    <div class="goodnightkiss fullscreenvideo">
      <div class="innercontainer">
        <p style:color={$goodnightKissStore.color}>
          {$goodnightKissStore.username}
        </p>
        <img src="/bedge.png" alt="bruh" />
      </div>
      <!-- svelte-ignore a11y_media_has_caption -->
      <video autoplay loop>
        <source
          src={$goodnightKissStore.fast_version ? '/bedgeborderfast.webm' : '/bedgeborder.webm'}
        /> Video tagsmile
      </video>
      <audio autoplay loop volume="0.2">
        <source
          src={$goodnightKissStore.fast_version ? '/bedgefast.mp3' : '/bedge.mp3'}
          type="audio/mpeg"
        /> Audio
      </audio>
    </div>
  {/if}
  {#if mistakeCount < mistakeStore.count}
    <div class="fullscreenvideo">
      <!-- svelte-ignore a11y_media_has_caption -->
      <video autoplay onended={onMistakeDone}>
        <source src="/mistake.webm" /> Video tag smile
      </video>
    </div>
  {/if}
  <div bind:this={chatBulletContainer} class="chatbullet"></div>
  {#if flashbangCount < flashbangStore.count}<div class="fullscreenvideo flashbang">
      <!-- svelte-ignore a11y_media_has_caption -->
      <video autoplay onended={onFlashbangDone}>
        <source src="/thinkfast.webm" /> Video tag smile
      </video>
    </div>{/if}
  {#each $showImageStore as [imgUrl]}
    <img class="showImage" src={imgUrl} alt="erm" onload={onShowImageLoad} />
  {/each}

  {#if $gambaStore.spinning || $gambaStore.result}
    <GambaWheel wheelState={$gambaStore} />
  {/if}

  <div
    class="rightpanel"
    style="left: {$positionStore.rightPanelX}px; top: {$positionStore.rightPanelY}px;"
  >
    {#if pollStore.data}
      <div class="grey-box">
        <h3>Poll: {pollStore.data?.title}</h3>
        {#each pollStore.data?.options ?? [] as option}
          <div class="option">
            <div class="option-title">{option.name} ({option.votes} votes)</div>
            <div class="progress-container">
              <div
                class="progress-bar"
                style="width: {(option.votes / (pollStore.totalVotes || 1)) * 100}%;"
              ></div>
            </div>
          </div>
        {/each}
        <p class="remaining">{formatDuration(pollRemainingMs)}</p>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill" style="width: {100 - pollProgressPct}%"></div>
        </div>
      </div>
    {/if}

    {#if predictionStore.data}
      <div class="grey-box">
        <h3>Prediction: {predictionStore.data?.title}</h3>
        <div class="small-meta">{predictionStore.data?.status}</div>
        {#each predictionStore.data?.outcomes ?? [] as outcome}
          <div class="option">
            <div class="option-title">
              {outcome.name} ({outcome.voters} votes, {outcome.channelPoints} pts)
            </div>
            <div class="progress-container">
              <div
                class="progress-bar"
                style="width: {(outcome.channelPoints / (predictionStore.totalChannelPoints || 1)) *
                  100}%;"
              ></div>
            </div>
          </div>
        {/each}
        <p class="remaining">{formatDuration(predictionRemainingMs)}</p>
        <div class="progress-bar-bg">
          <div class="progress-bar-fill" style="width: {100 - predictionProgressPct}%"></div>
        </div>
      </div>
    {/if}

    {#if biddingStore.data}
      <div class="grey-box">
        <h2>Bid (%bid)</h2>
        <h3>{biddingStore?.data.options.title}</h3>
        <div class="progress-container">
          <div
            class="progress-bar-blue"
            style="width: {((biddingStore.data.options.duration - biddingStore.data.elapsed) /
              biddingStore.data.options.duration) *
              100}%;"
          ></div>
        </div>
        {#each [...biddingStore?.data.bids.entries()] as [option, value]}
          <div class="option">
            <div class="option-title">{option} ({value} bid)</div>
            <div class="progress-container">
              <div
                class="progress-bar"
                style="width: {(value / biddingStore.totalBids) * 100}%;"
              ></div>
            </div>
          </div>
        {/each}
      </div>
    {/if}

    <div class="stockPanel" style="color: {cyclerSnapshot.color};">
      <div class="stockPanel-row">
        {@html cyclerSnapshot.icon ?? DEFAULT_STOCK_ICON}
        <p>{cyclerSnapshot.current}</p>
      </div>
      <span class="stockPanel-label">Stock: {cyclerSnapshot.symbol}</span>
    </div>
    <div bind:this={heartrateGraphParent} class="grey-box"></div>
  </div>
</div>

<style>
  .overlay-artist-widget {
    position: absolute;
    z-index: 100;
  }

  .streamelements {
    width: 100%;
    height: 100%;
    position: absolute;
    top: 0px;
    left: 0px;
  }

  .makiShared {
    width: 100%;
    height: 100%;
    position: absolute;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .makiShared .makiOutput .makiCountdown {
    background-color: rgba(0, 0, 0, 0.6);
    color: white;
    position: absolute;
    font-size: 2em;
    right: 1em;
    border: 2px solid green;
    border-radius: 10px;
  }

  .makiShared .makiOutput {
    position: relative;
    background-color: rgba(20, 20, 30, 0.55);
    color: white;
    border: 2px solid rgba(0, 123, 255, 0.7);
    border-radius: 12px;
    padding: 20px;
    overflow-wrap: break-word;
    word-wrap: break-word;
    overflow-y: hidden;
    width: 800px;
    height: 400px;
  }

  .makiShared p {
    margin: 0px;
    font-size: 2em;
    font-weight: bold;
  }

  .pinnedMessage {
    position: absolute;
    background: rgba(0, 0, 0, 0.7);
    border: 2px solid rgb(255, 105, 180);
    border-radius: 12px;
    padding: 8px 16px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-width: 400px;
    pointer-events: none;
  }

  .pinnedMessage .pinUser {
    color: rgb(255, 105, 180);
    font-size: 1.2em;
    font-weight: bold;
  }

  .pinnedMessage .pinText {
    color: white;
    font-size: 1.1em;
  }

  .pinnedMessage .pinKiki {
    color: rgb(255, 182, 193);
    font-size: 1em;
  }

  .showImage {
    position: absolute;
  }

  .checkInRedeems {
    display: flex;
    flex-direction: column;
    margin: 10%;
    position: absolute;
    width: 100%;
    height: 100%;
    top: 0;
    left: 0;
  }

  .checkInRedeems p {
    width: 50%;
    font-size: 24px;
    text-wrap: pretty;
    background-color: black;
    color: white;
    padding: 4px;
  }

  .checkInRedeems h1 {
    color: white;
    background-color: black;
    width: 50%;
  }

  .captcha {
    position: absolute;
    width: 30em;
    height: 10em;
    background-color: white;
    border-radius: 10px;
    border: 2px solid black;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .goodnightkiss .innercontainer {
    display: flex;
    align-items: center;
    flex-direction: column;
    position: absolute;
  }

  .goodnightkiss img {
    width: 200px;
  }

  .goodnightkiss p {
    font-size: 3em;
  }

  .fullscreenvideo {
    position: absolute;
    top: 0px;
    left: 0px;
    display: flex;
    width: 100%;
    height: 100%;
    align-items: center;
    justify-content: center;
  }

  .blackSilenceBorder {
    position: absolute;
    width: 100%;
    height: 100%;
    z-index: 1000;
    top: 0px;
    left: 0px;
    background: radial-gradient(farthest-side, transparent 0%, rgba(0, 0, 0, 0.9) 100%);
    background-size: 10000% 10000%;
    background-repeat: no-repeat;
    background-position: center;
    animation: growGradient 2s ease-in-out forwards;
  }

  @keyframes growGradient {
    to {
      background-size: 120% 120%;
    }
  }

  .blacksilence video {
    min-width: 25%;
    min-height: 25%;
    width: 25%;
    height: 25%;
  }

  video {
    min-width: 100%;
    min-height: 100%;
  }

  .overlay {
    position: absolute;
    top: 0px;
    left: 0px;
    width: 1920px;
    height: 1080px;
    overflow: hidden;
  }

  .chatbullet {
    position: absolute;
    top: 0px;
    left: 0px;
    width: 100%;
    height: 100%;
    color: lightgrey;
    font-size: 42px;
    overflow: none;
  }

  .rightpanel {
    display: flex;
    flex-direction: column;
    position: absolute;
    height: 100%;
    width: 400px;
    padding-top: 40px;
    padding-right: 10px;
    align-items: end;
  }

  .stockPanel {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 200px;
    font-family: 'Fredoka One';
    font-weight: bold;
  }

  .stockPanel-row {
    display: flex;
    flex-direction: row;
    align-items: center;
    font-size: 72px;
  }

  .stockPanel p {
    padding: 0;
    margin: 0;
  }

  .stockPanel-label {
    font-size: 14px;
    font-family: 'Fredoka One';
    opacity: 0.7;
  }

  .grey-box {
    width: 90%;
    padding: 10px;
    border: 1px solid #ccc;
    border-radius: 5px;
    background-color: rgba(255, 255, 255, 0.6);
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
    position: relative;
    overflow: hidden;
  }

  .progress-bar-bg {
    position: absolute;
    bottom: 0;
    left: 0;
    width: 100%;
    height: 6px;
    background: rgba(0, 0, 0, 0.1);
  }

  .progress-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, #4f46e5, #3b82f6);
    transition: width 0.25s linear;
    border-radius: 0 3px 3px 0;
  }

  .remaining {
    margin: 2px 0;
    font-size: 0.8em;
    color: #555;
  }

  .progress-bar {
    height: 10px;
    background-color: #4caf50;
    border-radius: 5px;
  }

  .progress-bar-blue {
    height: 10px;
    background-color: skyblue;
    border-radius: 5px;
  }

  .progress-container {
    width: 100%;
    background-color: #ddd;
    border-radius: 5px;
    margin-bottom: 10px;
  }

  .option {
    margin-bottom: 5px;
  }

  .option-title {
    font-size: 0.9em;
    margin-bottom: 2px;
  }
</style>
