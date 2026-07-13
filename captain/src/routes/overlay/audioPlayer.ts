import { playAudioStore } from './stores';
import type { OverlayDispatchers } from './dispatcher';
import { PUBLIC_TARGET_CHANNEL_ID } from '$env/static/public';

export class AudioPlayer {
  private currentlyPlaying: HTMLAudioElement[] = [];
  private unsub: (() => void) | null = null;

  constructor(private dispatchers: OverlayDispatchers) {}

  start() {
    this.unsub = playAudioStore.subscribe((url) => this.onUrl(url));
  }

  stop() {
    if (this.unsub) this.unsub();
    this.pauseAll();
  }

  pauseAll() {
    this.currentlyPlaying.forEach((aud) => aud.pause());
    this.currentlyPlaying = [];
  }

  purge() {
    this.pauseAll();
    playAudioStore.purge();
  }

  private onUrl(url: string | undefined) {
    if (!url) return;
    this.playUrl(url);
  }

  private async playUrl(url: string) {
    try {
      const audio = new Audio(url);
      audio.volume = 0.2;
      this.currentlyPlaying.push(audio);
      audio.addEventListener('ended', () => {
        this.onPlaybackOver(audio);
      });
      await audio.play();
    } catch {
      this.dispatchers.sendMessageAsUser(
        PUBLIC_TARGET_CHANNEL_ID,
        'failed to play for some reason'
      );
      playAudioStore.dequeue();
    }
  }

  private onPlaybackOver(audio: HTMLAudioElement) {
    playAudioStore.dequeue();
    this.currentlyPlaying = this.currentlyPlaying.filter((aud) => aud !== audio);
  }
}
