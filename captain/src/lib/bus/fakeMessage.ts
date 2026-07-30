import type { ChatMessage, ChatUser } from '@twurple/chat';

export function createFakeMessage(
  text: string,
  displayName?: string,
  channelId?: string,
  userId?: string
): ChatMessage {
  const name = displayName?.trim() || 'Faker';
  const uid = userId || '12345678';
  return {
    userInfo: {
      id: uid,
      userId: uid,
      displayName: name,
      userName: name.toLowerCase(),
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
