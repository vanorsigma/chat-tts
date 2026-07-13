<script lang="ts">
  import ConfigEditor from '$lib/ConfigEditor.svelte';
  import { Controller } from '$lib/controllers';
  import Faker from '$lib/Faker.svelte';
  import { configSchema } from '$lib/config/schema';
  import { onDestroy, onMount } from 'svelte';
  import { readable, writable } from 'svelte/store';
  import type { LogMessage } from '$lib/bus/messages';
  let configData: Record<string, unknown> | null = null;
  let controller: Controller | undefined;
  let saveStatus = '';

  let tail = false;

  const logs = writable<LogMessage[]>([]);
  let ws: WebSocket | undefined;

  onMount(() => {
    fetch('/api/config')
      .then((r) => r.json())
      .then((data) => {
        if (data) configData = data;
      })
      .catch(() => {});

    ws = new WebSocket('ws://localhost:3001/receivers');
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'log') {
          logs.update((l) => [...l.slice(-500), msg as LogMessage]);
        }
      } catch {
        // ignore
      }
    };
  });

  onDestroy(() => {
    ws?.close();
  });

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

  $: chatLogsStore = controller?.getChatLogsStore() ?? readable([]);
  const scrollToBottom = (node: HTMLElement, _data: unknown[]) => {
    const scroll = () =>
      node.scroll({
        top: node.scrollHeight,
        behavior: 'smooth'
      });
    scroll();

    return { update: scroll };
  };

  function onCancelSpeech() {
    controller?.cancel();
  }

  function onBlackSilence() {
    controller?.trinketController?.enable(controller?.trinketController.enabled);
  }

  onDestroy(() => {
    controller?.end();
  });
</script>

<svelte:head>
  <title>Vanor's TTS</title>
</svelte:head>

<h1>Vanor's TTS</h1>
<p>Magical TTS system for streaming purposes</p>

<section>
  <h2>Faker</h2>
  <p>Sends a mock message to the chat logs</p>
  <Faker onSend={(state, msg) => controller?.updateWithMessage(state, msg)} />
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
    <p>No config loaded. Create one below or upload a config.yml file.</p>
  {/if}
</section>

<section>
  <h2>Chat logs</h2>
  <label for="tail">
    <input name="tail" type="checkbox" bind:checked={tail} />
    Tail
  </label>
  <label for="cancel">
    <button name="cancel" on:click={onCancelSpeech}>Cancel Speech</button>
  </label>
  <label for="black-silence">
    <button name="black-silence" on:click={onBlackSilence}>Black Silence</button>
  </label>
  <div use:scrollToBottom={$chatLogsStore} class="chatlogs">
    {#each $chatLogsStore as message}
      <p>{message}</p>
    {/each}
  </div>
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
