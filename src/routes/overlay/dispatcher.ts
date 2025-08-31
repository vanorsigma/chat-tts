/**
 * Dispatches messages to any observers
 */

import tmi from 'tmi.js';

export interface OverlayObserver {
  onMessage(user: tmi.ChatUserstate, message: string): void;
}

export interface OverlayWhisperObserver {
  onWhisper(user: tmi.ChatUserstate, message: string): void;
}

export class OverlayDispatchers {
  observers: OverlayObserver[] = [];
  whisperObservers: OverlayWhisperObserver[] = [];
  private twitch: tmi.Client;

  constructor(twitch: tmi.Client) {
    twitch.on('chat', (_, userstate, message) => this.onMessage(userstate, message));
    this.twitch = twitch;
  }

  addObserver(observer: OverlayObserver) {
    if (!this.observers.includes(observer)) {
      this.observers.push(observer);
    }
  }

  removeObserver(observer: OverlayObserver) {
    this.observers = this.observers.filter((ob) => observer !== ob);
  }

  addWhisperObserver(observer: OverlayWhisperObserver) {
    this.whisperObservers.push(observer);
  }

  removeWhisperObserver(observer: OverlayWhisperObserver) {
    this.whisperObservers = this.whisperObservers.filter((ob) => observer !== ob);
  }

  private onMessage(user: tmi.ChatUserstate, message: string) {
    for (const observer of this.observers) {
      observer.onMessage(user, message);
    }
  }

  async sendMessageAsUser(message: string) {
    await this.twitch.say(this.twitch.getUsername(), message);
  }

  async sendWhisperToUser(username: string, message: string) {
    await this.twitch.whisper(username, message);
  }
}
