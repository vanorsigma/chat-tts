import { ChatClient, type ChatMessage } from '@twurple/chat';

export function planToTier(plan: string): number {
  if (plan === 'Prime' || plan === '1000') return 1;
  if (plan === '2000') return 2;
  if (plan === '3000') return 3;
  return 0;
}

export interface OverlayTwitchClient {
  client: ChatClient;
  connect(): Promise<void>;
  quit(): Promise<void>;
  onMessage(cb: (msg: ChatMessage) => void): void;
}

export function createOverlayTwitchClient(channelName: string): OverlayTwitchClient {
  const client = createNewTwitchClientV2(channelName);
  const listeners: Array<(msg: ChatMessage) => void> = [];

  client.onMessage((_channel, _user, _text, msg) => {
    for (const cb of listeners) cb(msg);
  });

  return {
    client,
    connect: async () => {
      client.connect();
    },
    quit: async () => {
      client.quit();
    },
    onMessage: (cb) => listeners.push(cb)
  };
}

export function createNewTwitchClientV2(channelName: string): ChatClient {
  console.log(`Creating Twitch chat client for channel: ${channelName}`);
  return new ChatClient({
    channels: [channelName],
    ssl: true,
    rejoinChannelsOnReconnect: true
  });
}
