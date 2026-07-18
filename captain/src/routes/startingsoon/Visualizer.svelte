<script lang="ts">
  import { onMount } from 'svelte';

  let { analyser }: { analyser: AnalyserNode | null } = $props();

  let canvas: HTMLCanvasElement;
  let animId: number;
  const BAR_COUNT = 64;
  const TEXT = 'Starting soon';
  const REPEATED_TEXT = TEXT.repeat(Math.ceil(BAR_COUNT / TEXT.length)).slice(0, BAR_COUNT);

  function getBarHeight(i: number, dataArray: Uint8Array, bufferLength: number, maxHeight: number): number {
    const t0 = i / BAR_COUNT;
    const t1 = (i + 1) / BAR_COUNT;

    const bin0 = Math.min(Math.floor(Math.pow(t0, 2) * bufferLength), bufferLength - 1);
    const bin1 = Math.min(Math.floor(Math.pow(t1, 2) * bufferLength), bufferLength - 1);

    let sum = 0;
    let count = 0;
    for (let b = bin0; b <= bin1 && b < bufferLength; b++) {
      sum += dataArray[b];
      count++;
    }
    const avg = count > 0 ? sum / count : 0;

    const compressed = Math.pow(avg / 255, 0.35);

    return compressed * maxHeight;
  }

  function draw() {
    if (!analyser || !canvas) {
      animId = requestAnimationFrame(draw);
      return;
    }

    const ctx = canvas.getContext('2d')!;
    const { width, height } = canvas;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(dataArray);

    ctx.clearRect(0, 0, width, height);

    const barWidth = width / BAR_COUNT;
    const maxHeight = height * 0.9;
    const fontSize = barWidth * 0.7;

    ctx.font = `bold ${fontSize}px "Fredoka One", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    for (let i = 0; i < BAR_COUNT; i++) {
      const barHeight = getBarHeight(i, dataArray, bufferLength, maxHeight);
      const x = i * barWidth;
      const y = height - barHeight;

      const lightness = 30 + (i / BAR_COUNT) * 20;
      ctx.fillStyle = `hsla(0, 0%, ${lightness}%, 0.6)`;
      ctx.fillRect(x, y, barWidth - 1, barHeight);
    }

    for (let i = 0; i < BAR_COUNT; i++) {
      const char = REPEATED_TEXT[i];
      if (char === ' ') continue;

      const barHeight = getBarHeight(i, dataArray, bufferLength, maxHeight);
      const x = i * barWidth + barWidth / 2;
      const y = height - barHeight;

      ctx.shadowColor = 'rgba(255, 255, 255, 0.7)';
      ctx.shadowBlur = 6;
      ctx.fillStyle = '#fff';
      ctx.fillText(char, x, y - 4);
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
    }

    animId = requestAnimationFrame(draw);
  }

  function resize() {
    if (!canvas) return;
    canvas.width = canvas.parentElement?.clientWidth ?? window.innerWidth;
    canvas.height = canvas.parentElement?.clientHeight ?? window.innerHeight;
  }

  onMount(() => {
    resize();
    window.addEventListener('resize', resize);
    animId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  });
</script>

<canvas bind:this={canvas} class="visualizer"></canvas>
