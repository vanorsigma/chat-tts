<script lang="ts">
  import gsap from 'gsap';
  import { gambaStore } from './gamba.svelte';
  import type { GambaWheelState } from './gamba.svelte';
  import type { GambaItem } from './gamba';
  import { positionStore } from '../stores/positions.svelte';
  import { properRandom } from '../utils';

  const winAudio = new Audio('/roulette-win.mp3');

  let { wheelState }: { wheelState: GambaWheelState } = $props();

  let resultText = $state('');
  let username = $derived(wheelState.context?.username ?? '');

  // const SPIN_DURATION = 30_000;
  const SPIN_DURATION = 5;
  let segments = $state<GambaItem[]>([]);

  $effect(() => {
    segments = wheelState.items;
  });

  let segData = $derived.by(() => {
    const totalWeight = segments.reduce((s, seg) => s + seg.weight, 0);
    let acc = 0;
    return segments.map((seg) => {
      const span = (seg.weight / totalWeight) * 360;
      const d = { item: seg, start: acc, span, end: acc + span, center: acc + span / 2 };
      acc += span;
      return d;
    });
  });

  function doSpin() {
    if (!wheelState || !segments.length) return;
    resultText = '';

    const winItem = wheelState.result!;
    const winIndex = segments.indexOf(winItem);
    const winSeg = segData[winIndex];
    const randomOffset = (properRandom() - 0.5) * winSeg.span * 0.8;
    const targetAngle = 360 * 12 + (270 - (winSeg.center + randomOffset));

    const onDone = wheelState.onDone;
    const segs = segData;
    const tracker = { rot: 0 };

    let lastSeg = -1;

    gsap
      .timeline()
      .to(
        '.wheel-svg',
        {
          rotation: targetAngle,
          duration: SPIN_DURATION,
          ease: 'circ.out',
          transformOrigin: '50% 50%'
        },
        0
      )
      .to(
        tracker,
        {
          rot: targetAngle,
          duration: SPIN_DURATION,
          ease: 'circ.out',
          onUpdate: () => {
            const ptrAngle = (((270 - tracker.rot) % 360) + 360) % 360;
            let currentSeg = -1;
            for (let i = 0; i < segs.length; i++) {
              if (ptrAngle >= segs[i].start && ptrAngle < segs[i].end) {
                currentSeg = i;
                break;
              }
            }
            if (currentSeg !== lastSeg && currentSeg !== -1) {
              lastSeg = currentSeg;
              const tick = new Audio('/roulette-tick.mp3');
              tick.play().catch(() => {});
            }
          },
          onComplete: () => {
            winAudio.currentTime = 0;
            winAudio.play().catch(() => {});
            const item = wheelState.result;
            const ctx = wheelState.context;
            resultText = item?.getLabel() ?? '';
            setTimeout(async () => {
              gambaStore.clear();
              try {
                if (item && ctx) {
                  await item.onWin(ctx);
                }
              } catch (e) {
                console.error('gamba onWin failed:', e);
              } finally {
                onDone?.();
              }
            }, 3000);
          }
        },
        0
      );
  }

  $effect(() => {
    if (wheelState.spinning && segments.length > 0) {
      doSpin();
    }
  });
</script>

{#if segments.length > 0}
  <div
    class="gamba-widget"
    style="left:{$positionStore.wheelX}; top:{$positionStore.wheelY}; width:{$positionStore.wheelWidth}; height:{$positionStore.wheelHeight};"
  >
    <div class="gamba-wheel-container">
      {#if username}
        <div class="spinner-label">{username}</div>
      {/if}
      <div class="wheel-wrapper">
        <div class="pointer">▼</div>
        <svg
          viewBox="0 0 400 400"
          width="100%"
          height="100%"
          class="wheel-svg"
          style="transform: rotate(0deg)"
        >
          {#each segData as seg, i}
            {@const a0 = (seg.start * Math.PI) / 180}
            {@const a1 = (seg.end * Math.PI) / 180}
            {@const aMid = (seg.center * Math.PI) / 180}
            {@const large = seg.span > 180 ? 1 : 0}
            {@const x0 = 200 + 180 * Math.cos(a0)}
            {@const y0 = 200 + 180 * Math.sin(a0)}
            {@const x1 = 200 + 180 * Math.cos(a1)}
            {@const y1 = 200 + 180 * Math.sin(a1)}
            {@const labelR = 110}
            {@const labelX = 200 + labelR * Math.cos(aMid)}
            {@const labelY = 200 + labelR * Math.sin(aMid)}
            {@const flip = Math.cos(aMid) < 0}
            {@const textRot = seg.center + (flip ? 180 : 0)}
            <path
              d={`M200,200 L${x0},${y0} A180,180 0 ${large},1 ${x1},${y1} Z`}
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
              transform={`rotate(${textRot}, ${labelX}, ${labelY})`}>{seg.item.getLabel()}</text
            >
          {/each}
          <circle cx="200" cy="200" r="25" fill="white" stroke="#333" stroke-width="1" />
        </svg>
      </div>
      {#if resultText}
        <div class="result">{resultText}</div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .gamba-widget {
    position: absolute;
    z-index: 500;
    container-type: inline-size;
    transform: translate(-50%, -50%);
  }

  .gamba-wheel-container {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3cqi;
  }

  .spinner-label {
    font-size: 4cqi;
    font-weight: bold;
    color: white;
    text-shadow: 1px 1px 3px black;
    background: rgba(0, 0, 0, 0.5);
    padding: 0.3em 1em;
    border-radius: 0.3em;
  }

  .wheel-wrapper {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
  }

  .pointer {
    position: absolute;
    top: -0.3em;
    z-index: 10;
    font-size: 5cqi;
    color: red;
    text-shadow: 0 0 0.15em white;
  }

  .result {
    font-size: 8cqi;
    font-weight: bold;
    color: white;
    text-shadow: 2px 2px 4px black;
    background: rgba(0, 0, 0, 0.7);
    padding: 0.2em 0.5em;
    border-radius: 0.2em;
  }
</style>
