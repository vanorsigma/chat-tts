<script lang="ts">
  import { onMount } from 'svelte';
  import { ChatBulletContainer } from './chatbullet';
  import { createNewAuthenticatedSelfTwitchClient } from '$lib/twitch';
  import { PUBLIC_TWITCH_OAUTH } from '$env/static/public';
  import { OverlayDispatchers } from './dispatcher';
  import { Commands } from './commands';
  import { pollStore, flashbangStore, blackSilenceStore } from './stores.svelte';

  export let chatBulletContainer: HTMLDivElement;
  let flashbangCount: number = 0;
  let blackSilenceCount: number = 0;
  let client = createNewAuthenticatedSelfTwitchClient('vanorsigma', PUBLIC_TWITCH_OAUTH);

  onMount(() => {
    new ChatBulletContainer(chatBulletContainer, client);
    let dispatchers = new OverlayDispatchers(client);
    let commands = new Commands(dispatchers);
    dispatchers.addObserver(commands);
    client.connect();
  });

  function onFlashbangDone() {
    flashbangCount = flashbangStore.count;
  }

  function onBlackSilenceDone() {
    blackSilenceCount = blackSilenceStore.count;
  }
</script>

<div class="overlay">
  <!-- I've checked, it's possible to embed StreamElements the thing here, but I'm not gonna -->
  <div bind:this={chatBulletContainer} class="chatbullet"></div>
  {#if flashbangCount < flashbangStore.count}<div class="flashbang">
      <!-- svelte-ignore a11y_media_has_caption -->
      <video autoplay onended={onFlashbangDone}>
        <source src="/thinkfast.webm" /> Video tag smile
      </video>
    </div>{/if}
  {#if blackSilenceCount < blackSilenceStore.count}<div class="blacksilence">
      <!-- svelte-ignore a11y_media_has_caption -->
      <video autoplay onended={onBlackSilenceDone}>
        <source src="/blacksilence.webm" /> Video tag smile
      </video>
    </div>{/if}
  {#if pollStore.data}
    <div class="poll-box">
      <h3>{pollStore.data?.title}</h3>
      {#each pollStore.data?.options ?? [] as option, idx}
        <div class="option">
          <div class="option-title">{option.name} [type {idx + 1}] ({option.votes} votes)</div>
          <div class="progress-container">
            <div
              class="progress-bar"
              style="width: {(option.votes / pollStore.totalVotes) * 100}%;"
            ></div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .blacksilence {
    display: flex;
    width: 100%;
    height: 100%;
    align-items: center;
    justify-content: center;
    /* background-color: black; */
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

  .poll-box {
    position: absolute;
    top: 40px;
    right: 10px;
    width: 400px;
    padding: 10px;
    border: 1px solid #ccc;
    border-radius: 5px;
    background-color: rgba(255, 255, 255, 0.6);
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
  }

  .progress-bar {
    height: 10px;
    background-color: #4caf50;
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
