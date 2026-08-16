import type { ChatMessage } from '@twurple/chat';
import type { OverlayDispatchers, OverlayObserver } from './dispatcher';
import { getOverlayConfig } from './constants';

export class NewChatterGreeter implements OverlayObserver {
  private dispatchers: OverlayDispatchers;

  constructor(dispatchers: OverlayDispatchers) {
    this.dispatchers = dispatchers;
    dispatchers.addObserver(this);
  }

  onMessage(message: ChatMessage): void {
    if (!message.isFirst) return;

    const { greeting } = getOverlayConfig().newChatterConfig;
    if (!greeting) return;

    const username = message.userInfo?.userName;
    const text = greeting.replaceAll('{user}', username ? `@${username}` : '');
    const channelId = message.channelId;
    if (!channelId) return;

    console.log(`New chatter ${username} said: "${message.text}"`);
    this.dispatchers.sendMessageAsUser(channelId, text, message.id);
  }
}
