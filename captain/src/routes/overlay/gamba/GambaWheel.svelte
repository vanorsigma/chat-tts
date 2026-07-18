<script lang="ts">
  import gsap from 'gsap';
  import { gambaStore } from './gamba.svelte';
  import type { GambaWheelState } from './gamba.svelte';
  import type { GambaItem } from './gamba';

  let { wheelState }: { wheelState: GambaWheelState } = $props();

  let resultText = $state('');

  // const SPIN_DURATION = 30_000;
  const SPIN_DURATION = 5;
  let segments = $state<GambaItem[]>([]);

  $effect(() => {
    segments = wheelState.items;
  });

  function doSpin() {
    if (!wheelState || !segments.length) return;
    resultText = '';

    const winIndex = segments.indexOf(wheelState.result!);
    const segmentAngle = 360 / segments.length;
    const randomOffset = (Math.random() - 0.5) * segmentAngle * 0.8;
    const targetAngle =
      360 * 12 + (270 - (winIndex * segmentAngle + segmentAngle / 2 + randomOffset));

    const onDone = wheelState.onDone;

    gsap.to('.wheel-svg', {
      rotation: targetAngle,
      duration: SPIN_DURATION,
      ease: 'circ.out',
      transformOrigin: '50% 50%',
      onComplete: () => {
        const item = wheelState.result;
        const ctx = wheelState.context;
        resultText = item?.label ?? '';
        setTimeout(async () => {
          gambaStore.clear();
          if (item && ctx) {
            await item.onWin(ctx);
          }
          onDone?.();
        }, 3000);
      }
    });
  }

  $effect(() => {
    if (wheelState.spinning && segments.length > 0) {
      doSpin();
    }
  });
</script>

{#if segments.length > 0}
  <div class="gamba-wheel-container">
    <div class="wheel-wrapper">
      <div class="pointer">▼</div>
      <svg
        viewBox="0 0 400 400"
        width="70vmin"
        height="70vmin"
        class="wheel-svg"
        style="transform: rotate(0deg)"
      >
        {#each segments as segment, i}
          {@const anglePer = 360 / segments.length}
          {@const alpha = anglePer / 2}
          {@const labelR = 110}
          {@const labelX = 200 + labelR * Math.cos((alpha * Math.PI) / 180)}
          {@const labelY = 200 + labelR * Math.sin((alpha * Math.PI) / 180)}
          {@const worldAngle = (i * anglePer + alpha) % 360}
          {@const flip = Math.cos((worldAngle * Math.PI) / 180) < 0}
          {@const textRot = alpha + (flip ? 180 : 0)}
          <g transform="rotate({i * anglePer}, 200, 200)">
            <path
              d="M200,200 L380,200 A180,180 0 0,1 {200 +
                180 * Math.cos(anglePer * (Math.PI / 180))},{200 +
                180 * Math.sin(anglePer * (Math.PI / 180))} Z"
              fill={`hsl(${(i * 360) / segments.length}, 60%, ${i % 2 === 0 ? 55 : 70}%)`}
              stroke="white"
              stroke-width="2"
            />
            <text
              x={labelX}
              y={labelY}
              text-anchor="middle"
              dominant-baseline="middle"
              fill="white"
              font-size="14"
              font-weight="bold"
              style="text-shadow: 0 0 4px rgba(0,0,0,0.8); pointer-events: none;"
              transform="rotate({textRot}, {labelX}, {labelY})">{segment.label}</text
            >
          </g>
        {/each}
        <circle cx="200" cy="200" r="25" fill="white" stroke="#333" stroke-width="1" />
      </svg>
    </div>
    {#if resultText}
      <div class="result">{resultText}</div>
    {/if}
  </div>
{/if}

<style>
  .gamba-wheel-container {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    z-index: 500;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
  }

  .wheel-wrapper {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .pointer {
    position: absolute;
    top: -10px;
    z-index: 10;
    font-size: 32px;
    color: red;
    text-shadow: 0 0 5px white;
  }

  .result {
    font-size: 48px;
    font-weight: bold;
    color: white;
    text-shadow: 2px 2px 4px black;
    background: rgba(0, 0, 0, 0.7);
    padding: 10px 30px;
    border-radius: 10px;
  }
</style>
