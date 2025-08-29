/**
 * Commands that only work if an overlay exists
 */

import type { ChatUserstate } from "tmi.js";
import { OverlayDispatchers, type OverlayObserver } from "./dispatcher";
import { pollCommandHandler } from "./poll.svelte";

export class Commands implements OverlayObserver {
  dispatchers?: OverlayDispatchers = undefined

  constructor(dispatchers?: OverlayDispatchers) {
    this.dispatchers = dispatchers
  }

  onMessage(user: ChatUserstate, message: string): void {
    if (!this.dispatchers) {
      throw new Error("No dispatcher");
    }

    const commandIndicator = message.split(' ')[0];
    switch (commandIndicator) {
      case '%poll':
        pollCommandHandler(this.dispatchers, user, message);
        break;
    }
    return;
  }
}
