/**
 * Commands that only work if an overlay exists
 */

import type { ChatUserstate } from 'tmi.js';
import {
  OverlayDispatchers,
  type OverlayObserver,
  type OverlayWhisperObserver
} from './dispatcher';
import { pollCommandHandler } from './poll.svelte';
import { flashbangStore } from './stores.svelte';

const COOLDOWN = 10 * 1000;

function checkInHandler(dispatcher: OverlayDispatchers, user: ChatUserstate, message: string) {
  dispatcher.sendMessageAsUser(`meow ${user.username}`);
}

function flashbangHandler(dispatcher: OverlayDispatchers, user: ChatUserstate, message: string) {
  if (Math.random() < 0.5) {
    flashbangStore.increment();
    dispatcher.sendMessageAsUser('Throwing a flashbang');
  } else {
    dispatcher.sendMessageAsUser('NO');
  }
}

function placeholderHandler(
  dispatcher: OverlayDispatchers,
  user: ChatUserstate,
  message: string,
  isWhisper: boolean
) {
  dispatcher.sendMessageAsUser('meow');
}

export class Commands implements OverlayObserver {
  dispatchers?: OverlayDispatchers = undefined;
  nextValid: number = new Date().getTime();

  constructor(dispatchers?: OverlayDispatchers) {
    this.dispatchers = dispatchers;
  }

  callOnlyIfPastCooldown(callback: () => void) {
    if (new Date().getTime() >= this.nextValid) {
      callback();
      this.nextValid = new Date().getTime() + COOLDOWN;
    }
  }

  onMessage(user: ChatUserstate, message: string): void {
    if (!this.dispatchers) {
      throw new Error('No dispatcher');
    }

    const dispatcher = this.dispatchers;
    const commandIndicator = message.split(' ')[0];
    switch (commandIndicator) {
      case '%poll':
        this.callOnlyIfPastCooldown(() => pollCommandHandler(dispatcher, user, message));
        break;
      case '%checkin':
        this.callOnlyIfPastCooldown(() => checkInHandler(dispatcher, user, message));
        break;
      case '%flashbang':
        this.callOnlyIfPastCooldown(() => flashbangHandler(dispatcher, user, message));
        break;
      case '%score':
        this.callOnlyIfPastCooldown(() => placeholderHandler(dispatcher, user, message, false));
        break;
    }
    return;
  }
}
