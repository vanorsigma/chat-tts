<script lang="ts">
  import { onMount } from 'svelte';
  import confetti from 'canvas-confetti';

  let { ondone }: { ondone: () => void } = $props();

  const DURATION_MS = 8000;
  const COLORS = ['#ff2d55', '#ffcc00', '#4f46e5', '#22c55e', '#f97316'];
  const ORIGINS = [
    { x: 0.2, y: 0.65 },
    { x: 0.8, y: 0.65 },
    { x: 0.5, y: 0.85 }
  ];

  let canvas: HTMLCanvasElement;

  onMount(() => {
    const fire = confetti.create(canvas, { resize: true });
    const end = Date.now() + DURATION_MS;
    const timer = setInterval(() => {
      const left = end - Date.now();
      if (left <= 0) {
        clearInterval(timer);
        void fire.reset();
        ondone();
        return;
      }

      const particleCount = Math.ceil(40 * (left / DURATION_MS));
      for (const origin of ORIGINS) {
        void fire({
          particleCount,
          spread: 360,
          startVelocity: 45,
          origin,
          colors: COLORS,
          ticks: 120
        });
      }
    }, 300);

    return () => {
      clearInterval(timer);
      void fire.reset();
    };
  });
</script>

<canvas bind:this={canvas} class="fireworks"></canvas>

<style>
  .fireworks {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 10000;
  }
</style>
