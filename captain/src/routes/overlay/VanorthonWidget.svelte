<script lang="ts">
  import { onMount } from 'svelte';
  import { milestoneProgressOf, type VanorthonData } from '$lib/vanorthon';

  let { onmilestone }: { onmilestone: () => void } = $props();

  const POLL_MS = 5 * 60 * 1000;
  const SLIDE_MS = 6000;
  const POINTS = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

  let vanorthon = $state<VanorthonData | null>(null);
  let showProgress = $state(true);
  let lastAchieved: number | null = null;

  const progress = $derived(vanorthon ? milestoneProgressOf(vanorthon) : null);

  async function poll() {
    try {
      const response = await fetch('/api/vanorthon', { cache: 'no-store' });
      if (!response.ok) throw new Error(`status ${response.status}`);
      const next = (await response.json()) as VanorthonData;
      const snapshot = milestoneProgressOf(next);

      if (lastAchieved !== null && snapshot.achievedCount > lastAchieved) onmilestone();
      lastAchieved = snapshot.achievedCount;
      vanorthon = next;
    } catch (error) {
      console.warn('Vanorthon poll failed:', error);
    }
  }

  onMount(() => {
    void poll();
    const pollTimer = setInterval(() => void poll(), POLL_MS);
    const slideTimer = setInterval(() => (showProgress = !showProgress), SLIDE_MS);
    return () => {
      clearInterval(pollTimer);
      clearInterval(slideTimer);
    };
  });
</script>

{#if vanorthon}
  {@const subs = vanorthon.rates.subsUnitValue}
  {@const bits = vanorthon.rates.bitsUnitValue * 100}
  {@const bitsLabel = POINTS.format(bits)}
  <div class="panel">
    <div class="slide" class:visible={showProgress} inert={!showProgress}>
      {#if progress?.next}
        <p class="label">Next goal</p>
        <p class="title">{progress.next.title}</p>
        <div
          class="bar"
          role="progressbar"
          aria-label="Points towards the next milestone"
          aria-valuemin={0}
          aria-valuemax={progress.next.goal}
          aria-valuenow={progress.next.earned}
          aria-valuetext={`${POINTS.format(progress.next.earned)} of ${POINTS.format(
            progress.next.goal
          )} points`}
        >
          <div class="fill" style:width={`${progress.next.percent}%`}></div>
        </div>
        <p class="points">
          {POINTS.format(progress.next.earned)} / {POINTS.format(progress.next.goal)} points
        </p>
      {:else if progress?.achievedCount}
        <p class="label">Next goal</p>
        <p class="title">All milestones reached!</p>
        <div
          class="bar"
          role="progressbar"
          aria-label="All milestones reached"
          aria-valuemin={0}
          aria-valuemax={1}
          aria-valuenow={1}
        >
          <div class="fill" style:width="100%"></div>
        </div>
      {:else}
        <p class="label">Vanorthon</p>
        <p class="title">No milestones yet</p>
      {/if}
    </div>

    <div class="slide" class:visible={!showProgress} inert={showProgress}>
      <p class="label">Support the Vanorthon</p>
      <a class="site" href={vanorthon.siteUrl} target="_blank" rel="noreferrer">
        {vanorthon.siteUrl}
      </a>
      <p class="rates">
        1 sub = {POINTS.format(subs)} points · 100 bits = {bitsLabel} point{bitsLabel === '1'
          ? ''
          : 's'}
      </p>
      <p class="rates">1 USD = 1 point</p>
    </div>
  </div>
{/if}

<style>
  .panel {
    position: relative;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    border-radius: 5px;
    background-color: rgba(255, 255, 255, 0.6);
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
    overflow: hidden;
    color: #1b1b1b;
  }

  .slide {
    position: absolute;
    inset: 0;
    box-sizing: border-box;
    padding: 10px 16px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 4px;
    opacity: 0;
    transition: opacity 700ms ease;
  }

  .slide.visible {
    opacity: 1;
  }

  .label {
    margin: 0;
    font-size: 0.7em;
    font-weight: bold;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #555;
  }

  .title {
    margin: 0;
    font-size: 1.1em;
    font-weight: bold;
    line-height: 1.2;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .bar {
    height: 10px;
    background-color: #ddd;
    border-radius: 5px;
    overflow: hidden;
  }

  .fill {
    height: 100%;
    background: linear-gradient(90deg, #4f46e5, #3b82f6);
    border-radius: 5px;
    transition: width 400ms ease;
  }

  .points {
    margin: 0;
    font-size: 0.8em;
    color: #555;
  }

  .site {
    font-size: 1.1em;
    font-weight: bold;
    color: #4f46e5;
    text-decoration: none;
  }

  .rates {
    margin: 0;
    font-size: 0.8em;
    color: #333;
  }
</style>
