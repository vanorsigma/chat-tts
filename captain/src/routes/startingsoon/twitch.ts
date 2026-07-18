import { createOverlayTwitchClient } from '$lib/twitch';
import type { ChatMessage } from '@twurple/chat';

export function createTwitchClient(channelName: string, onMessage: (msg: ChatMessage) => void) {
  const client = createOverlayTwitchClient(channelName);
  client.onMessage(onMessage);
  client.connect();
  return client;
}
