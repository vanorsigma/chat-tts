import type { OverlayDispatchers } from '../../dispatcher';
import type { ChatMessage } from '@twurple/chat';
import type { Commands } from '../index';
import { enqueueGambaSpin } from '../../gamba/queue';
import { requireUsername } from './shared';

export function gambaHandler(
  commands: Commands,
  dispatcher: OverlayDispatchers,
  message: ChatMessage
) {
  const username = requireUsername(message);
  if (!username) return;

  const now = Date.now();
  const userCooldownMs = 60_000;

  const globalLast = commands.gambaUserCooldowns.get('__global__') ?? 0;
  if (now < globalLast + userCooldownMs) {
    dispatcher.sendMessageAsUser(
      message.channelId!,
      `%gamba is on global cooldown (wait ${Math.ceil((globalLast + userCooldownMs - now) / 1000)}s)`,
      message.id
    );
    return;
  }

  const lastUser = commands.gambaUserCooldowns.get(username) ?? 0;
  if (now < lastUser + userCooldownMs) {
    dispatcher.sendMessageAsUser(
      message.channelId!,
      `%gamba is on cooldown for you (wait ${Math.ceil((lastUser + userCooldownMs - now) / 1000)}s)`,
      message.id
    );
    return;
  }

  commands.gambaUserCooldowns.set('__global__', now);
  commands.gambaUserCooldowns.set(username, now);

  enqueueGambaSpin({ dispatcher, channelId: message.channelId!, username });
}
