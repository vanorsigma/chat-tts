<script lang="ts">
  import type { ClipState } from './stores/rest.svelte';

  const STALL_SLACK_MS = 15000;
  const UNKNOWN_DURATION_MS = 5 * 60 * 1000;

  let { clip, onended }: { clip: ClipState; onended: () => void } = $props();

  let stallTimer: ReturnType<typeof setTimeout> | undefined;

  function clearStallTimer() {
    if (stallTimer) {
      clearTimeout(stallTimer);
      stallTimer = undefined;
    }
  }

  function finish(clipId: string) {
    if (clipId !== clip.id) return;
    clearStallTimer();
    onended();
  }

  function armStallTimer(clipId: string, video: HTMLVideoElement) {
    if (clipId !== clip.id) return;

    const remainingMs =
      Number.isFinite(video.duration) && video.duration > 0
        ? Math.max(0, video.duration - video.currentTime) * 1000
        : UNKNOWN_DURATION_MS;

    clearStallTimer();
    stallTimer = setTimeout(() => finish(clipId), remainingMs + STALL_SLACK_MS);
  }

  $effect(() => () => clearStallTimer());
</script>

{#key clip.id}
  {@const clipId = clip.id}
  <!-- svelte-ignore a11y_media_has_caption -->
  <video
    class="clip-video"
    autoplay
    playsinline
    onloadedmetadata={(event) => armStallTimer(clipId, event.currentTarget)}
    ontimeupdate={(event) => armStallTimer(clipId, event.currentTarget)}
    onended={() => finish(clipId)}
    onerror={() => finish(clipId)}
  >
    <source src={`/api/clip/${clipId}`} type="video/mp4" />
  </video>
{/key}

<style>
  .clip-video {
    width: 100%;
    height: 100%;
    object-fit: contain;
    background-color: rgba(0, 0, 0, 0.6);
  }
</style>
