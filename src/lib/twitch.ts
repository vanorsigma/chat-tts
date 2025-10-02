// Connects to the Twitch IRC server
import { AppTokenAuthProvider } from '@twurple/auth';
import { ChatClient } from '@twurple/chat';
import { ApiClient } from '@twurple/api';

export function createNewTwitchClientV2(channelName: string): ChatClient {
  return new ChatClient({
    channels: [channelName],
    ssl: true,
    rejoinChannelsOnReconnect: true
  });
}

export function createNewTwitchApiClient(client_id: string, client_secret: string): ApiClient {
  const scopes = ['user:write:chat', 'user:bot'];

  const authProvider = new AppTokenAuthProvider(client_id, client_secret, scopes);
  return new ApiClient({
    authProvider
  });
}
