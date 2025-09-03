/**
 * Commands that only work if an overlay exists
 */

import type { ChatUserstate } from 'tmi.js';
import { OverlayDispatchers, type OverlayObserver } from './dispatcher';
import { pollCommandHandler } from './poll.svelte';
import { blackSilenceStore, flashbangStore } from './stores.svelte';
import type { CancelTTS, DisableTTS } from '$lib/remoteTTSMessages';

const COOLDOWN = 10 * 1000;

export const BLACK_SILENCE_DURATION = 10 * 1000;

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

function blackSilenceHandler(ws: WebSocket) {
  blackSilenceStore.increment();
  ws.send(
    JSON.stringify({
      type: 'tts',
      command: {
        type: 'cancel'
      }
    } as CancelTTS)
  );

  ws.send(
    JSON.stringify({
      type: 'tts',
      command: {
        type: 'disable',
        duration: BLACK_SILENCE_DURATION / 1000
      }
    } as DisableTTS)
  );
}

function placeholderHandler(dispatcher: OverlayDispatchers, user: ChatUserstate, message: string) {
  dispatcher.sendMessageAsUser('meow');
}

export class Commands implements OverlayObserver {
  dispatchers?: OverlayDispatchers = undefined;
  nextValid: number = new Date().getTime();

  private busWs?: WebSocket = undefined;

  constructor(dispatchers?: OverlayDispatchers) {
    this.dispatchers = dispatchers;
  }

  setBusURL(url: string) {
    if (this.busWs) {
      this.busWs.close();
    }

    const ws = new WebSocket(url);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ws.onopen = (_) => {
      console.log('ws open');
      this.busWs = ws;
    };

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ws.onclose = (_) => {
      console.log('ws close');
      this.busWs = undefined;
    };
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
        this.callOnlyIfPastCooldown(() => placeholderHandler(dispatcher, user, message));
        break;
      case '%blacksilence':
        if (this.busWs) blackSilenceHandler(this.busWs);
        break;
    }
    return;
  }
}
