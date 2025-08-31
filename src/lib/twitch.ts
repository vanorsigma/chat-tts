// Connects to the Twitch IRC server
import tmi from 'tmi.js';

export function createNewTwitchClient(channelName: string): tmi.Client {
  return tmi.Client({
    connection: {
      secure: true,
      reconnect: true
    },
    channels: [channelName]
  });
}

export function createNewAuthenticatedSelfTwitchClient(
  username: string,
  oauth: string
): tmi.Client {
  return tmi.Client({
    connection: {
      secure: true,
      reconnect: true
    },
    channels: [username],
    identity: {
      username,
      password: `oauth:${oauth}`
    }
  });
}
