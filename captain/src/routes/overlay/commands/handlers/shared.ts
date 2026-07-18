import type { ChatMessage } from '@twurple/chat';
import type { OverlayDispatchers } from '../../dispatcher';
import { checkCostAddIfEnough } from '../middleware';

export function requireUsername(message: ChatMessage): string | null {
  return message.userInfo.userName ?? null;
}

export async function withCostOrFreeUser(
  dispatcher: OverlayDispatchers,
  message: ChatMessage,
  freeUser: string,
  cost: number,
  onApprove: () => Promise<void> | void
): Promise<boolean> {
  const username = requireUsername(message);
  if (!username) return false;

  if (username === freeUser) {
    dispatcher.sendMessageAsUser(message.channelId!, 'ok', message.id);
    await onApprove();
    return true;
  }

  if (!(await checkCostAddIfEnough(dispatcher, message.channelId!, username, -cost, message.id)))
    return false;

  dispatcher.sendMessageAsUser(message.channelId!, `-${cost}`, message.id);
  await onApprove();
  return true;
}
