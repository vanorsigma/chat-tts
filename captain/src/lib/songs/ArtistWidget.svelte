<script lang="ts">
  import type { SongData } from './types';

  let {
    song,
    rate,
    remainingMs,
    flying,
    progressPct = 0
  }: {
    song: SongData | null;
    rate: number;
    remainingMs: number;
    flying: boolean;
    progressPct?: number;
  } = $props();

  let cachedSong = $state<SongData | null>(null);
  let show = $state(false);
  let wasFlying = $state(false);

  $effect(() => {
    if (song) {
      cachedSong = song;
      show = true;
    }
    if (flying) {
      wasFlying = true;
    }
    if (!song && !flying && show && wasFlying) {
      const timer = setTimeout(() => {
        show = false;
        cachedSong = null;
        wasFlying = false;
      }, 500);
      return () => clearTimeout(timer);
    }
  });

  let displaySong = $derived(song ?? cachedSong);

  function formatDuration(ms: number): string {
    if (ms <= 0) return '0:00';
    const totalSec = Math.ceil(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  }
</script>

{#if show && displaySong}
  <div class="artist-widget" class:flying>
    <img class="artist-pic" src={displaySong.coverUrl} alt={displaySong.coverArtist} />
    <div class="info">
      <p class="song-name">{displaySong.name}</p>
      <p class="cover-artist">{displaySong.coverArtist}</p>
      <p class="actual-artist">cover of {displaySong.actualArtist}</p>
      <p class="playback-rate">rate: {rate.toFixed(2)}x</p>
      <p class="remaining">{formatDuration(remainingMs)}</p>
    </div>
    <div class="progress-bar-bg">
      <div class="progress-bar-fill" style="width: {progressPct}%"></div>
    </div>
  </div>
{/if}

<style>
  .artist-widget {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 12px;
    border: 1px solid #ccc;
    border-radius: 5px;
    background-color: rgba(255, 255, 255, 0.6);
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
    padding: 12px 16px;
    opacity: 0;
    transform: translateX(50px);
    position: relative;
    overflow: hidden;
    transition:
      opacity 0.5s ease,
      transform 0.5s ease;
  }

  .artist-widget.flying {
    opacity: 1;
    transform: translateX(0);
  }

  .artist-pic {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    object-fit: cover;
    border: 2px solid rgba(0, 0, 0, 0.15);
  }

  .info {
    display: flex;
    flex-direction: column;
  }

  .song-name {
    margin: 0;
    font-size: 1.2em;
    font-weight: bold;
  }

  .cover-artist {
    margin: 0;
    font-size: 0.9em;
    color: #555;
  }

  .actual-artist {
    margin: 0;
    font-size: 0.75em;
    color: #666;
  }

  .playback-rate {
    margin: 2px 0 0;
    font-size: 0.8em;
    color: #4caf50;
  }

  .remaining {
    margin: 2px 0 0;
    font-size: 0.8em;
    color: #555;
  }

  .progress-bar-bg {
    position: absolute;
    bottom: 0;
    left: 0;
    width: 100%;
    height: 6px;
    background: rgba(0, 0, 0, 0.1);
  }

  .progress-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, #4f46e5, #3b82f6);
    transition: width 0.25s linear;
    border-radius: 0 3px 3px 0;
  }
</style>
