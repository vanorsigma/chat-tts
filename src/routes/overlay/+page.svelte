<script lang="ts">
  import { onMount } from 'svelte';
  import { ChatBulletContainer } from './chatbullet';
  import { createNewAuthenticatedSelfTwitchClient, createNewTwitchClient } from '$lib/twitch';
  import { PUBLIC_TWITCH_OAUTH, PUBLIC_BUS_URL, PUBLIC_HEARTRATE_URL } from '$env/static/public';
  import { OverlayDispatchers } from './dispatcher';
  import { BLACK_SILENCE_DURATION, Commands } from './commands';
  import {
    pollStore,
    flashbangStore,
    blackSilenceStore,
    maxwellStore,
    mistakeStore
  } from './stores.svelte';
  import { CaptchaObserver } from './captcha';
  import { Heartrate } from './heartrate';

  export let chatBulletContainer: HTMLDivElement;
  let heartrate = new Heartrate(PUBLIC_HEARTRATE_URL);

  let flashbangCount: number = 0;
  let blackSilenceCount: number = 0;
  let client = createNewAuthenticatedSelfTwitchClient('vanorsigma', PUBLIC_TWITCH_OAUTH);
  let chatBulletBackend: ChatBulletContainer | undefined = undefined;

  let blackSilenceBorder = false;

  let captchaElement: HTMLDivElement;
  let captchaText: string | null = null;
  let captchaTop = 0;
  let captchaLeft = 0;

  let catDVDElement: HTMLImageElement;
  let catDVDCount = 0;
  let catDVDTop: number = 0;
  let catDVDLeft: number = 0;
  let catDVDVector: [number, number] = normalizeVector([
    (Math.random() - 0.5) * 2,
    (Math.random() - 0.5) * 2
  ]);

  let catDVDLastAnimate = performance.now();
  let catDVDStartTime = new Date().getTime();
  let catDVDLock = false; // lock so that the reactive block doesn't run more than once

  let mistakeCount = 0;

  $: {
    if (!catDVDLock && catDVDElement && catDVDCount < $maxwellStore) {
      catDVDAnimationFrame();
      catDVDLock = true;
      catDVDStartTime = new Date().getTime();
      catDVDTop = 0;
      catDVDLeft = 0;
    }
  }

  function normalizeVector(vector: [number, number]): [number, number] {
    const sumSquared = Math.sqrt(Math.pow(vector[0], 2) + Math.pow(vector[1], 2));
    return [vector[0] / sumSquared, vector[1] / sumSquared];
  }

  function catDVDHitEdge(maxHeight: number, maxWidth: number): boolean {
    return catDVDTop <= 0 || catDVDLeft <= 0 || catDVDTop >= maxHeight || catDVDLeft >= maxWidth;
  }

  function catDVDModifyVector(maxHeight: number, maxWidth: number) {
    const hitHori = catDVDLeft <= 0 || catDVDLeft >= maxWidth;
    const hitVert = catDVDTop <= 0 || catDVDTop >= maxHeight;

    let newX = catDVDVector[1];
    let newY = catDVDVector[0];

    if (hitHori) {
      newX = (catDVDVector[1] + 0.0) * -1;
    }

    if (hitVert) {
      newY = (catDVDVector[0] + 0.0) * -1;
    }

    catDVDVector = normalizeVector([newY, newX]);
  }

  function catDVDAnimationFrame() {
    const width = catDVDElement.width;
    const height = catDVDElement.height;

    const edgeWidth = 1920 - width;
    const edgeHeight = 1080 - height;

    const currentTime = performance.now();
    const delta = currentTime - catDVDLastAnimate;
    catDVDLastAnimate = currentTime;

    if (catDVDHitEdge(edgeHeight, edgeWidth)) {
      catDVDModifyVector(edgeHeight, edgeWidth);
    }

    catDVDTop += catDVDVector[0] * delta;
    catDVDLeft += catDVDVector[1] * delta;

    requestAnimationFrame(() => {
      if (new Date().getTime() - catDVDStartTime < 30 * 1000) {
        catDVDAnimationFrame();
      } else {
        catDVDCount += maxwellStore.count;
        catDVDLock = false;
      }
    });
  }

  onMount(() => {
    chatBulletBackend = new ChatBulletContainer(chatBulletContainer, client);
    let dispatchers = new OverlayDispatchers(client);
    let commands = new Commands(dispatchers);
    commands.setBusURL(PUBLIC_BUS_URL);
    dispatchers.addObserver(commands);
    client.connect();
    captchaLoop(dispatchers);
  });

  function captchaLoop(dispatcher: OverlayDispatchers) {
    setTimeout(
      () => {
        captchaTop =
          Math.random() *
          (1080 - Number(getComputedStyle(captchaElement).height.replace('px', '')));
        captchaLeft =
          Math.random() * (1920 - Number(getComputedStyle(captchaElement).width.replace('px', '')));

        let captcha = new CaptchaObserver(dispatcher, () => {
          captchaText = null;
          captchaLoop(dispatcher);
        });
        captchaText = captcha.value;
      },
      Math.max(1000, Math.random() * 10 * 60 * 1000)
    );
  }

  function onFlashbangDone() {
    flashbangCount = flashbangStore.count;
  }

  function onBlackSilenceStart() {
    chatBulletBackend?.deleteAllBullets();
    chatBulletBackend?.setEnabled(false);
    blackSilenceBorder = true;
    setTimeout(() => {
      chatBulletBackend?.setEnabled(true);
      blackSilenceBorder = false;
    }, BLACK_SILENCE_DURATION);
  }

  function onBlackSilenceDone() {
    blackSilenceCount = blackSilenceStore.count;
  }

  function onMistakeDone() {
    mistakeCount = mistakeStore.count;
  }
</script>

<div class="overlay">
  <img
    class="catDVD"
    bind:this={catDVDElement}
    style={`visibility: ${catDVDCount < maxwellStore.count ? 'visible' : 'hidden'}; top: ${catDVDTop}px; left: ${catDVDLeft}px`}
    src="/catBreadSpin.gif"
    alt="goaway"
    width="200px"
  />
  <div
    bind:this={captchaElement}
    class="captcha"
    style={`top: ${captchaTop}px; left: ${captchaLeft}px; visibility: ${captchaText ? 'visible' : 'hidden'}`}
  >
    <span style="font-size: 5em">{captchaText}</span>
  </div>
  <!-- I've checked, it's possible to embed StreamElements the thing here, but I'm not gonna -->
  {#if blackSilenceBorder}
    <div class="blackSilenceBorder"></div>
  {/if}
  {#if blackSilenceCount < blackSilenceStore.count}<div class="fullscreenvideo blacksilence">
      <!-- svelte-ignore a11y_media_has_caption -->
      <video autoplay onended={onBlackSilenceDone} onplaying={onBlackSilenceStart}>
        <source src="/blacksilence.webm" /> Video tag smile
      </video>
    </div>{/if}
  {#if mistakeCount < mistakeStore.count}
    <div class="fullscreenvideo">
      <!-- svelte-ignore a11y_media_has_caption -->
      <video autoplay onended={onMistakeDone}>
        <source src="/mistake.webm" /> Video tag smile
      </video>
    </div>
  {/if}
  <div bind:this={chatBulletContainer} class="chatbullet"></div>
  {#if flashbangCount < flashbangStore.count}<div class="flashbang">
      <!-- svelte-ignore a11y_media_has_caption -->
      <video autoplay onended={onFlashbangDone}>
        <source src="/thinkfast.webm" /> Video tag smile
      </video>
    </div>{/if}
  <div class="rightpanel">
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
    <div class="heartrate">
      <svg
        width="70.90000000000006"
        height="70.90000000000006"
        viewBox="-720 -750 1500 1450"
        style="margin: 0px 30px 0px 0px; filter: none;"
        ><path
          transform="scale(25)"
          style="transform-origin: center center 0px; transform-box: fill-box; stroke-width: 0px;"
          fill="#f72d21ff"
          d="M51.911,16.242C51.152,7.888,45.239,1.827,37.839,1.827c-4.93,0-9.444,2.653-11.984,6.905
  c-2.517-4.307-6.846-6.906-11.697-6.906c-7.399,0-13.313,6.061-14.071,14.415c-0.06,0.369-0.306,2.311,0.442,5.478
  c1.078,4.568,3.568,8.723,7.199,12.013l18.115,16.439l18.426-16.438c3.631-3.291,6.121-7.445,7.199-12.014
  C52.216,18.553,51.97,16.611,51.911,16.242z"
        ></path><animateTransform
          attributeName="transform"
          type="scale"
          values="0.8; 1.1; 1; 1.1; 1.1; 0.8;"
          dur="500ms"
          repeatCount="indefinite"
          additive="sum"
        ></animateTransform></svg
      >
      <p>{$heartrate}</p>
    </div>
  </div>
</div>

<style>
  .catDVD {
    position: absolute;
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

  .fullscreenvideo {
    display: flex;
    width: 100%;
    height: 100%;
    align-items: center;
    justify-content: center;
    /* background-color: black; */
  }

  .blackSilenceBorder {
    position: absolute;
    width: 100%;
    height: 100%;
    z-index: 1000;
    background: radial-gradient(
      farthest-side,
      transparent 0%,
      /* transparent 40%, */ rgba(0, 0, 0, 0.9) 100%
    );
    background-size: 10000% 10000%; /* Initial size of the gradient */
    background-repeat: no-repeat;
    background-position: center; /* Centers the gradient */
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
    top: 0px;
    right: 0px;
    height: 100%;
    width: 400px;
    padding-top: 40px;
    padding-right: 10px;
  }

  .heartrate {
    display: flex;
    flex-direction: row;
    align-items: center;
    width: 200px;
    color: rgb(4, 187, 175);
    font-family: 'Fredoka One';
    font-size: 72px;
    font-weight: bold;
  }

  .heartrate p {
    padding: 0;
    margin: 0;
  }

  .poll-box {
    width: 90%;
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
