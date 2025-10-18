<script lang="ts">
  import { onMount } from 'svelte';
  import { ChatBulletContainer } from './chatbullet';
  import { createNewTwitchApiClient, createNewTwitchClientV2 } from '$lib/twitch';
  import {
    PUBLIC_BUS_URL,
    PUBLIC_RECEIVER_URL,
    PUBLIC_HEARTRATE_URL,
    PUBLIC_TWITCH_APP_ID,
    PUBLIC_TWITCH_APP_SECRET,
    PUBLIC_TWITCH_BOT_ID,
    PUBLIC_KIKI_API
  } from '$env/static/public';
  import { OverlayDispatchers } from './dispatcher';
  import { BLACK_SILENCE_DURATION, Commands } from './commands';
  import {
    pollStore,
    flashbangStore,
    blackSilenceStore,
    maxwellStore,
    mistakeStore,
    showImageStore,
    goodnightKissStore,
    createCheckInStore
  } from './stores.svelte';
  import { CaptchaObserver } from './captcha';
  import { Heartrate } from './heartrate';
  import { GLOBAL_HEART_STOCK_MARKET } from './heartstockmarket.svelte';
  import * as d3 from 'd3';
  import type { ChatClient } from '@twurple/chat';

  export let chatBulletContainer: HTMLDivElement;
  let heartrate = new Heartrate(PUBLIC_HEARTRATE_URL);
  let stockMarket = GLOBAL_HEART_STOCK_MARKET;

  let flashbangCount: number = 0;
  let blackSilenceCount: number = 0;
  let client: ChatClient | null = null;
  let chatBulletBackend: ChatBulletContainer | undefined = undefined;

  let blackSilenceBorder = false;

  let captchaElement: HTMLDivElement;
  let captchaText: string | null = null;
  let captchaTop = 0;
  let captchaLeft = 0;

  let catDVDOverlay: HTMLDivElement;
  let catDVDCount = 0;

  let mistakeCount = 0;

  let heartrateGraphParent: HTMLDivElement;

  const checkInStore = createCheckInStore(new WebSocket(PUBLIC_RECEIVER_URL));

  function onShowImageLoad(event: Event) {
    // once the image loads, reposition and rescale it immediately
    const target = event.target;
    if (!(target as HTMLImageElement).naturalWidth || !(target as HTMLImageElement).naturalHeight)
      return;

    const imgTarget = target as HTMLImageElement;
    const style = getComputedStyle(chatBulletContainer);
    const { width, height } = style;
    const fullWidthNo = Number(width.replace('px', ''));
    const fullHeightNo = Number(height.replace('px', ''));

    const { naturalWidth, naturalHeight } = imgTarget;
    const targetWidth = Math.max(Math.random(), 0.5) * Math.min(Math.max(naturalWidth, 80), 500);
    const targetHeight = (naturalHeight / naturalWidth) * targetWidth;

    imgTarget.style.left = `${targetWidth + Math.random() * (fullWidthNo - 2 * targetWidth)}px`;
    imgTarget.style.top = `${targetHeight + Math.random() * (fullHeightNo - 2 * targetHeight)}px`;
    imgTarget.style.width = `${targetWidth}px`;
    imgTarget.style.height = `${targetHeight}px`;
  }

  $: {
    if (catDVDCount < $maxwellStore) {
      const ele = new Image();
      ele.src = '/catBreadSpin.gif';
      ele.style.position = 'relative';
      ele.style.width = '200px';
      catDVDOverlay.append(ele);

      catDVDAnimationFrame(ele, performance.now(), 0, 0, [
        (Math.random() - 0.5) * 2,
        (Math.random() - 0.5) * 2
      ]);
    }
  }

  function normalizeVector(vector: [number, number]): [number, number] {
    const sumSquared = Math.sqrt(Math.pow(vector[0], 2) + Math.pow(vector[1], 2));
    return [vector[0] / sumSquared, vector[1] / sumSquared];
  }

  function catDVDHitEdge(top: number, left: number, maxHeight: number, maxWidth: number): boolean {
    return top <= 0 || left <= 0 || top >= maxHeight || left >= maxWidth;
  }

  function catDVDModifyVector(
    left: number,
    top: number,
    maxHeight: number,
    maxWidth: number,
    vector: [number, number]
  ) {
    let newX = vector[1];
    let newY = vector[0];

    if (left <= 0) {
      newX = Math.abs(vector[1]);
    } else if (left >= maxWidth) {
      newX = Math.abs(vector[1]) * -1;
    }

    if (top <= 0) {
      newY = Math.abs(vector[0]);
    } else if (top >= maxHeight) {
      newY = Math.abs(vector[0]) * -1;
    }

    return normalizeVector([newY, newX]);
  }

  function catDVDAnimationFrame(
    element: HTMLImageElement,
    startTimestamp: number,
    top: number,
    left: number,
    vector: [number, number],
    lastAnimate = performance.now()
  ) {
    const width = element.width;
    const height = element.height;

    const edgeWidth = 1920 - width;
    const edgeHeight = 1080 - height;

    const currentTime = performance.now();
    const delta = currentTime - lastAnimate;
    lastAnimate = currentTime;

    if (catDVDHitEdge(top, left, edgeHeight, edgeWidth)) {
      vector = catDVDModifyVector(left, top, edgeHeight, edgeWidth, vector);
    }

    top += vector[0] * delta;
    left += vector[1] * delta;

    element.style.top = `${top}px`;
    element.style.left = `${left}px`;

    requestAnimationFrame(() => {
      if (currentTime - startTimestamp < 30 * 1000) {
        catDVDAnimationFrame(element, startTimestamp, top, left, vector, currentTime);
      } else {
        catDVDOverlay.removeChild(element);
        catDVDCount += maxwellStore.count;
      }
    });
  }

  function buildSvgGraphFor(numbers: number[]): SVGSVGElement | null {
    const width = 928;
    const height = 500;
    const marginTop = 20;
    const marginRight = 30;
    const marginBottom = 30;
    const marginLeft = 40;

    const dataset = numbers.map((val, ind) => [val, ind]);
    // Declare the x (horizontal position) scale.
    const x = d3.scaleLinear(
      [0, d3.max(dataset as [number, number][], (d: [number, number]) => d[1])] as any,
      [marginLeft, width - marginRight]
    );

    // Declare the y (vertical position) scale.
    const y = d3.scaleLinear(
      [
        d3.min(dataset as [number, number][], (d: [number, number]) => d[0]) as any,
        d3.max(dataset as [number, number][], (d: [number, number]) => d[0]) as any
      ],
      [height - marginBottom, marginTop]
    );

    // Declare the line generator.
    const line = d3
      .line()
      .x((d: [number, number]) => x(d[1]))
      .y((d: [number, number]) => y(d[0]));

    // Create the SVG container.
    const svg = d3
      .create('svg')
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', [0, 0, width, height])
      .attr('style', 'max-width: 100%; height: auto; height: intrinsic;');

    // Add the x-axis.
    svg
      .append('g')
      .attr('transform', `translate(0,${height - marginBottom})`)
      .call(
        d3
          .axisBottom(x)
          .ticks(width / 80)
          .tickSizeOuter(0)
      );

    // Add the y-axis, remove the domain line, add grid lines and a label.
    svg
      .append('g')
      .attr('transform', `translate(${marginLeft},0)`)
      .call(d3.axisLeft(y).ticks(height / 40))
      .call((g: any) => g.select('.domain').remove())
      .call((g) =>
        g
          .selectAll('.tick line')
          .clone()
          .attr('x2', width - marginLeft - marginRight)
          .attr('stroke-opacity', 0.1)
      )
      .call((g: any) =>
        g
          .append('text')
          .attr('x', -marginLeft)
          .attr('y', 10)
          .attr('fill', 'currentColor')
          .attr('text-anchor', 'start')
          .text('Heartrate')
      );

    // Append a path for the line.
    svg
      .append('path')
      .attr('fill', 'none')
      .attr('stroke', 'red')
      .attr('stroke-width', 5.0)
      .attr('d', line(dataset as any));

    return svg.node();
  }

  onMount(async () => {
    client = createNewTwitchClientV2('vanorsigma');
    stockMarket.setHeartrateObject(heartrate);
    let apiClient = createNewTwitchApiClient(PUBLIC_TWITCH_APP_ID, PUBLIC_TWITCH_APP_SECRET);

    chatBulletBackend = new ChatBulletContainer(chatBulletContainer, client, PUBLIC_KIKI_API);
    let dispatchers = new OverlayDispatchers(client, apiClient, PUBLIC_TWITCH_BOT_ID);
    let commands = new Commands(dispatchers);
    commands.setBusURL(PUBLIC_BUS_URL);
    dispatchers.addObserver(commands);
    client.connect();
    captchaLoop(dispatchers);

    stockMarket.subscribe((heartrates) => {
      const graph = buildSvgGraphFor(heartrates);
      if (!graph) return;
      heartrateGraphParent.innerHTML = '';
      heartrateGraphParent.appendChild(graph);
    });
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
    showImageStore.purge();

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
  <div class="catDVDOverlay" bind:this={catDVDOverlay}></div>
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
    <div bind:this={heartrateGraphParent} class="heartrategraph"></div>
  </div>
</div>

<style>
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

  .catDVDOverlay {
    position: relative;
    width: 100%;
    height: 100%;
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
    /* background-color: black; */
  }

  .blackSilenceBorder {
    position: absolute;
    width: 100%;
    height: 100%;
    z-index: 1000;
    top: 0px;
    left: 0px;
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
    align-items: end;
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
