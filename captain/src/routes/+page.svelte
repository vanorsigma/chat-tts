<script lang="ts">
  import ConfigEditor from '$lib/ConfigEditor.svelte';
  import Faker from '$lib/Faker.svelte';
  import { configSchema } from '$lib/config/schema';
  import { onDestroy, onMount } from 'svelte';
  import { writable } from 'svelte/store';
  import type { LogMessage } from '$lib/bus/messages';
  import type { SongData } from '$lib/songs/types';
  import { isSongStateMessage, isSongCompleteMessage } from '$lib/songs/messages';

  type LogLine = LogMessage & { _id: number };
  let _nextLogId = 0;

  let configData: Record<string, unknown> | null = $state(null);
  let saveStatus = $state('');

  let tail = $state(false);
  let configCollapsed = $state(false);

  const logs = writable<LogLine[]>([]);
  let receiverWs: WebSocket | undefined;
  let senderWs: WebSocket | undefined;

  let providers: Array<{ id: string; label: string }> = $state([]);
  let selectedProviderId = $state('');
  let availableSongs: SongData[] = $state([]);
  let songQueue: SongData[] = $state([]);
  let manualSongId = $state('');
  let songFeedback = $state('');
  let volume = $state(0.5);
  let currentPlayingSongId = $state('');

  async function fetchProviders() {
    try {
      const res = await fetch('/api/song/providers');
      providers = await res.json();
      if (providers.length > 0) selectedProviderId = providers[0].id;
    } catch {
      providers = [];
    }
  }

  async function fetchSongs() {
    if (!selectedProviderId) return;
    try {
      const res = await fetch(`/api/song/${selectedProviderId}/fetch`);
      availableSongs = await res.json();
    } catch {
      availableSongs = [];
    }
  }

  function addToQueue(song: SongData) {
    if (!songQueue.find((s) => s.id === song.id)) {
      songQueue = [...songQueue, song];
      sendBus({
        type: 'song-control',
        command: { type: 'loadQueue', songs: songQueue }
      });
    }
  }

  function addAllToQueue() {
    for (const song of availableSongs) {
      if (!songQueue.find((s) => s.id === song.id)) {
        songQueue = [...songQueue, song];
      }
    }
    sendBus({
      type: 'song-control',
      command: { type: 'loadQueue', songs: songQueue }
    });
  }

  function removeFromQueue(id: string) {
    songQueue = songQueue.filter((s) => s.id !== id);
    sendBus({ type: 'song-control', command: { type: 'removeFromQueue', songId: id } });
  }

  function moveInQueue(from: number, to: number) {
    const item = songQueue.splice(from, 1)[0];
    if (item) {
      songQueue.splice(to, 0, item);
      songQueue = [...songQueue];
      sendBus({
        type: 'song-control',
        command: { type: 'reorderQueue', fromIndex: from, toIndex: to }
      });
    }
  }

  function sendPlay() {
    sendBus({ type: 'song-control', command: { type: 'play' } });
  }
  function sendPause() {
    sendBus({ type: 'song-control', command: { type: 'pause' } });
  }
  function sendSkip() {
    const idx = songQueue.findIndex((s) => s.id === currentPlayingSongId);
    if (idx < 0) {
      sendBus({ type: 'song-control', command: { type: 'skip' } });
      return;
    }
    const nextSong = songQueue[idx + 1] ?? null;
    const skippedSongId = currentPlayingSongId;
    songQueue = songQueue.filter((s) => s.id !== skippedSongId);
    sendBus({
      type: 'song-control',
      command: { type: 'skip', skippedSongId, nextSong }
    });
  }

  function shuffleQueue() {
    const shuffled = [...songQueue];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    songQueue = shuffled;
    sendBus({
      type: 'song-control',
      command: { type: 'loadQueue', songs: songQueue }
    });
  }

  async function addManualSong() {
    if (!manualSongId) return;
    try {
      const res = await fetch(`/api/song/search/${encodeURIComponent(manualSongId)}`);
      if (res.ok) {
        const song = await res.json();
        addToQueue(song);
        manualSongId = '';
        songFeedback = `Added "${song.id}"`;
      } else {
        songFeedback = `Song "${manualSongId}" not found`;
      }
    } catch {
      songFeedback = `Song "${manualSongId}" not found`;
    }
    setTimeout(() => (songFeedback = ''), 3000);
  }

  onMount(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((data) => {
        if (data) configData = data;
      })
      .catch(() => {});

    fetchProviders();

    receiverWs = new WebSocket('ws://localhost:3001/receivers');
    receiverWs.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'log') {
          const line: LogLine = { ...(msg as LogMessage), _id: _nextLogId++ };
          logs.update((l) => [...l.slice(-500), line]);
        }
        if (isSongStateMessage(msg)) {
          currentPlayingSongId = msg.songId ?? '';
        }
        if (isSongCompleteMessage(msg)) {
          if (msg.songId === currentPlayingSongId) {
            currentPlayingSongId = '';
          }
          if (songQueue.find((s) => s.id === msg.songId)) {
            songQueue = songQueue.filter((s) => s.id !== msg.songId);
            sendBus({
              type: 'song-control',
              command: { type: 'removeFromQueue', songId: msg.songId }
            });
          }
        }
      } catch {
        // ignore
      }
    };

    senderWs = new WebSocket('ws://localhost:3001/senders');

    function ensureOpen(cb: () => void) {
      if (senderWs && senderWs.readyState === WebSocket.OPEN) {
        cb();
      } else if (senderWs) {
        senderWs.addEventListener('open', cb, { once: true });
      }
    }

    (window as unknown as Record<string, unknown>)._sendBus = (msg: object) => {
      ensureOpen(() => senderWs!.send(JSON.stringify(msg)));
    };
  });

  onDestroy(() => {
    receiverWs?.close();
    senderWs?.close();
  });

  function sendBus(msg: object) {
    if (senderWs?.readyState === WebSocket.OPEN) {
      senderWs.send(JSON.stringify(msg));
    }
  }

  function onFaker(text: string, username: string) {
    sendBus({ type: 'faker', text, displayName: username || undefined });
  }

  function onFakerSub(username: string, tier: number) {
    sendBus({ type: 'faker-sub', displayName: username || undefined, tier });
  }

  function onFakerBits(username: string, amount: number) {
    sendBus({ type: 'faker-bits', displayName: username || undefined, amount });
  }

  function onCancelSpeech() {
    sendBus({ type: 'control', op: 'cancel' });
  }

  function onBlackSilence() {
    sendBus({ type: 'control', op: 'blackSilence' });
  }

  async function onSaveConfig() {
    if (!configData) return;
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configData)
      });
      if (res.ok) {
        saveStatus = 'Saved';
        configData = JSON.parse(JSON.stringify(configData));
        if (configData) {
          const positions = configData.overlayPositionsConfig ?? {
            artistWidgetX: 20,
            artistWidgetY: 20,
            rightPanelX: 1520,
            rightPanelY: 0
          };
          sendBus({ type: 'overlayPositions', positions });
        }
      } else {
        const err = await res.json();
        saveStatus = `Error: ${err.error ?? 'unknown'}`;
      }
    } catch (e) {
      saveStatus = `Error: ${e}`;
    }
    setTimeout(() => (saveStatus = ''), 3000);
  }

  const scrollToBottom = (node: HTMLElement, _data: unknown[]) => {
    const scroll = () => {
      if (!tail) return;
      node.scrollTop = node.scrollHeight;
    };
    scroll();

    return { update: scroll };
  };
</script>

<svelte:head>
  <title>Vanor's TTS</title>
</svelte:head>

<h1>Vanor's TTS</h1>
<p>Magical TTS system for streaming purposes</p>

<section>
  <h2>Faker</h2>
  <p>Sends a mock message to test TTS</p>
  <Faker onFakerChat={onFaker} {onFakerSub} {onFakerBits} />
</section>

<section>
  <h2 class="collapsible-header" onclick={() => (configCollapsed = !configCollapsed)}>
    Config {configCollapsed ? '▶' : '▼'}
  </h2>
  {#if !configCollapsed}
    {#if configData}
      <ConfigEditor schema={configSchema} data={configData} />
      <button onclick={onSaveConfig}>Save Config</button>
      {#if saveStatus}
        <span class="save-status">{saveStatus}</span>
      {/if}
    {:else}
      <p>No config loaded. Create one or upload a config.yml file.</p>
    {/if}
  {/if}
</section>

<section>
  <h2>Controls</h2>
  <button onclick={onCancelSpeech}>Cancel Speech</button>
  <button onclick={onBlackSilence}>Black Silence</button>
</section>

<section>
  <h2>Songs</h2>
  <div class="songs-controls">
    <div class="songs-row">
      <select bind:value={selectedProviderId} onchange={fetchSongs}>
        {#each providers as p}
          <option value={p.id}>{p.label}</option>
        {/each}
      </select>
      <button onclick={fetchSongs}>Fetch</button>
    </div>

    <div class="songs-row">
      <input
        type="text"
        bind:value={manualSongId}
        placeholder="Manual song id"
        onkeydown={(e) => {
          if (e.key === 'Enter') addManualSong();
        }}
      />
      <button onclick={addManualSong}>Add</button>
      {#if songFeedback}<span class="song-feedback">{songFeedback}</span>{/if}
    </div>

    <div class="song-playback-controls">
      <button onclick={sendPlay}>Play</button>
      <button onclick={sendPause}>Pause</button>
      <button onclick={sendSkip}>Skip</button>
      <label>
        Vol
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          bind:value={volume}
          oninput={() => sendBus({ type: 'song-control', command: { type: 'setVolume', volume } })}
        />
        {Math.round(volume * 100)}%
      </label>
    </div>

    <h3>Available ({availableSongs.length})
      <button class="add-all-btn" onclick={addAllToQueue} disabled={availableSongs.length === 0}>Add All</button>
    </h3>
    <div class="song-list">
      {#each availableSongs as song}
        <div class="song-item">
          <span class="song-name">{song.name}</span>
          <span class="song-artist">by {song.coverArtist}</span>
          <button onclick={() => addToQueue(song)}>+</button>
        </div>
      {/each}
    </div>

    <h3>Queue ({songQueue.length})
      <button onclick={shuffleQueue} disabled={songQueue.length < 2}>Shuffle</button>
    </h3>
    <div class="song-list queue">
      {#each songQueue as song, i}
        <div class="song-item" class:current-playing={song.id === currentPlayingSongId}>
          <span class="song-index">{i + 1}.</span>
          <span class="song-name">{song.name}</span>
          <span class="song-artist">by {song.coverArtist}</span>
          <button onclick={() => moveInQueue(i, Math.max(0, i - 1))} disabled={i === 0 || song.id === currentPlayingSongId}>↑</button>
          <button
            onclick={() => moveInQueue(i, Math.min(songQueue.length - 1, i + 1))}
            disabled={i === songQueue.length - 1 || song.id === currentPlayingSongId}>↓</button
          >
          <button onclick={() => removeFromQueue(song.id)} disabled={song.id === currentPlayingSongId}>×</button>
        </div>
      {/each}
    </div>
  </div>
</section>

<section>
  <h2>Logs</h2>
  <label for="log-tail">
    <input name="log-tail" type="checkbox" bind:checked={tail} />
    Tail
  </label>
  <div use:scrollToBottom={$logs} class="chatlogs logs">
    {#each $logs as entry (entry._id)}
      <p class="log-{entry.level}" title={new Date(entry.ts).toLocaleTimeString()}>
        [{entry.level.toUpperCase()}] {entry.msg}
      </p>
    {/each}
  </div>
</section>

<style>
  section {
    display: flex;
    flex-direction: column;
    gap: 0.3em;
    margin-bottom: 1em;
  }

  button {
    color: white;
    background-color: blue;
    border-radius: 0.5em;
    padding: 5px;
  }

  button:disabled {
    background-color: grey;
  }

  .chatlogs {
    overflow-y: scroll;
    height: 30em;
    background-color: lightgrey;
    border: black 2px;
  }

  .logs {
    background-color: #1e1e1e;
    color: #d4d4d4;
    font-family: monospace;
    font-size: 0.85em;
    padding: 0.5em;
  }

  :global(.log-info) {
    color: #d4d4d4;
  }

  :global(.log-warn) {
    color: #cca700;
  }

  :global(.log-error) {
    color: #f44747;
  }

  :global(.log-debug) {
    color: #808080;
  }

  .collapsible-header {
    cursor: pointer;
    user-select: none;
  }

  .save-status {
    margin-left: 0.5em;
    font-size: 0.85em;
  }

  .songs-controls {
    display: flex;
    flex-direction: column;
    gap: 0.5em;
  }

  .songs-row {
    display: flex;
    gap: 0.5em;
    align-items: center;
  }

  .songs-row select,
  .songs-row input {
    padding: 4px;
    border: 1px solid #ccc;
    border-radius: 4px;
  }

  .song-playback-controls {
    display: flex;
    gap: 0.5em;
  }

  .song-list {
    max-height: 200px;
    overflow-y: auto;
    border: 1px solid #ccc;
    border-radius: 4px;
    padding: 4px;
  }

  .song-item {
    display: flex;
    align-items: center;
    gap: 0.5em;
    padding: 2px 4px;
  }

  .song-item:hover {
    background: rgba(0, 0, 0, 0.05);
  }

  .song-item.current-playing {
    background: rgba(255, 255, 0, 0.2);
  }

  .song-index {
    width: 2em;
    color: #666;
  }

  .song-name {
    flex: 1;
    font-weight: 500;
  }

  .song-artist {
    color: #666;
    font-size: 0.85em;
    margin-right: 0.5em;
  }

  .song-feedback {
    color: #4caf50;
    font-size: 0.85em;
  }

  .add-all-btn {
    margin-left: 0.5em;
    font-size: 0.65em;
    padding: 2px 8px;
    vertical-align: middle;
  }
</style>
