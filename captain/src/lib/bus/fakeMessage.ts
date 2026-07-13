import type { ChatMessage, ChatUser } from '@twurple/chat';

export function createFakeMessage(text: string, displayName?: string, channelId?: string): ChatMessage {
  return {
    userInfo: {
      id: '12345678',
      userId: '12345678',
      displayName: displayName ?? 'Faker',
      userName: (displayName ?? 'faker').toLowerCase(),
      color: '#000000',
      badges: new Map(),
      emotes: new Map(),
      isMod: false,
      isVip: false,
      isBroadcaster: false
    } as unknown as ChatUser,
    text,
    channelId: channelId ?? '',
    emoteOffsets: new Map(),
    id: `fake-${Date.now()}`
  } as unknown as ChatMessage;
}
