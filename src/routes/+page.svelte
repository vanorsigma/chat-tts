<script lang="ts">
  import { parseYaml, type FullConfig } from '$lib/config';
  import ConfigDisplay from '$lib/ConfigDisplay.svelte';
  import { Controller } from '$lib/controller';
  import Editor from '$lib/Editor.svelte';
  import Faker from '$lib/Faker.svelte';
  import { getVoicesList } from '$lib/speech';
  import { onDestroy, onMount } from 'svelte';
  import { readable } from 'svelte/store';

  let voices = getVoicesList();
  let config: FullConfig | undefined;
  let selectedVoice: SpeechSynthesisVoice | undefined = undefined;

  let previousConfigText = '';
  let configText = '';
  let controller: Controller | undefined;

  let tail = false;

  $: chatLogsStore = controller?.getChatLogsStore() ?? readable([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const scrollToBottom = (node: HTMLElement, _data: string[]) => {
    const scroll = () =>
      node.scroll({
        top: node.scrollHeight,
        behavior: 'smooth'
      });
    scroll();

    return { update: scroll };
  };

  function onReloadConfig() {
    config = parseYaml(configText).toFullConfig();
    controller?.end();

    controller = new Controller(config);
    controller?.start();

    previousConfigText = configText;
  }

  function onCancelSpeech() {
    controller?.cancel();
  }

  onMount(() => {
    // NOTE: edge hides the voice list for some reason, need to rerun just to get
    setTimeout(() => {
      voices = getVoicesList();
    }, 1000);
  });

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
  <h2>Voice ID picker</h2>
  <p>Use this section to get voice IDs for config purposes</p>
  <label for="voices">Choose a voice:</label>
  <select bind:value={selectedVoice} id="voices" name="voices">
    {#each voices as voice}
      <option value={voice}>{voice.name}</option>
    {/each}
  </select>
  <pre>{selectedVoice?.name}</pre>
</section>

<section>
  <h2>Faker</h2>
  <p>Sends a mock message to the chat logs</p>
  <Faker onSend={(state, msg) => controller?.updateWithMessage(state, msg)} />
</section>

<section>
  <h2>Config</h2>
  {#if config}
    <ConfigDisplay {config} />
  {/if}
  <p>Paste the YAML file here and click "Reload config."</p>
  <Editor bind:configText />
  <button on:click={onReloadConfig} disabled={previousConfigText.trim() === configText.trim()}
    >Reload Config</button
  >
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
  <div use:scrollToBottom={$chatLogsStore} class="chatlogs">
    {#each $chatLogsStore as message}
      <p>{message}</p>
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
</style>
