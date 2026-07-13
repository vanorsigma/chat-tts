import type { ChatMessage, ChatUser } from '@twurple/chat';

export function createFakeMessage(text: string, displayName?: string): ChatMessage {
  return {
    userInfo: {
      id: '12345678',
      displayName: displayName ?? 'Faker',
      userName: (displayName ?? 'faker').toLowerCase(),
      color: '#000000',
      emotes: new Map()
    } as unknown as ChatUser,
    text
  } as unknown as ChatMessage;
}
