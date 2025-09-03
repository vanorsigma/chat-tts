/**
 * Dispatches messages to any observers
 */

import tmi from 'tmi.js';

export interface OverlayObserver {
  onMessage(user: tmi.ChatUserstate, message: string): void;
}

export class OverlayDispatchers {
  observers: OverlayObserver[] = [];
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

  private onMessage(user: tmi.ChatUserstate, message: string) {
    for (const observer of this.observers) {
      observer.onMessage(user, message);
    }
  }

  async sendMessageAsUser(message: string) {
    await this.twitch.say(this.twitch.getUsername(), message);
  }
}
