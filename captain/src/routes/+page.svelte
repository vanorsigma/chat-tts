<script lang="ts">
  import ConfigEditor from '$lib/ConfigEditor.svelte';
  import Faker from '$lib/Faker.svelte';
  import { configSchema } from '$lib/config/schema';
  import { onDestroy, onMount } from 'svelte';
  import { writable } from 'svelte/store';
  import type { LogMessage } from '$lib/bus/messages';

  let configData: Record<string, unknown> | null = null;
  let saveStatus = '';

  let tail = false;

  const logs = writable<LogMessage[]>([]);
  let receiverWs: WebSocket | undefined;
  let senderWs: WebSocket | undefined;

  onMount(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((data) => {
        if (data) configData = data;
      })
      .catch(() => {});

    receiverWs = new WebSocket('ws://localhost:3001/receivers');
    receiverWs.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'log') {
          logs.update((l) => [...l.slice(-500), msg as LogMessage]);
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

  function onFaker(text: string) {
    sendBus({ type: 'faker', text });
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
    const scroll = () =>
      node.scroll({
        top: node.scrollHeight,
        behavior: 'smooth'
      });
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
  <Faker onSend={onFaker} />
</section>

<section>
  <h2>Config</h2>
  {#if configData}
    <ConfigEditor schema={configSchema} data={configData} />
    <button on:click={onSaveConfig}>Save Config</button>
    {#if saveStatus}
      <span class="save-status">{saveStatus}</span>
    {/if}
  {:else}
    <p>No config loaded. Create one or upload a config.yml file.</p>
  {/if}
</section>

<section>
  <h2>Controls</h2>
  <button on:click={onCancelSpeech}>Cancel Speech</button>
  <button on:click={onBlackSilence}>Black Silence</button>
</section>

<section>
  <h2>Logs</h2>
  <label for="log-tail">
    <input name="log-tail" type="checkbox" bind:checked={tail} />
    Tail
  </label>
  <div use:scrollToBottom={$logs} class="chatlogs logs">
    {#each $logs as entry}
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

  .save-status {
    margin-left: 0.5em;
    font-size: 0.85em;
  }
</style>
