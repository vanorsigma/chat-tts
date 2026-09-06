import type { OverlayDispatchers } from '../../dispatcher';
import type { ChatMessage } from '@twurple/chat';
import type { Commands } from '../index';
import { enqueueGambaSpin } from '../../gamba/queue';
import { requireUsername } from './shared';
import { checkCostAddIfEnough } from '../middleware';

export async function gambaHandler(
  commands: Commands,
  dispatcher: OverlayDispatchers,
  message: ChatMessage
) {
  const username = requireUsername(message);
  if (!username) return;

  const now = Date.now();

  const globalWait = commands.cooldowns.globalRemainingMs('%gamba', message.userInfo, now);
  if (globalWait > 0) {
    dispatcher.sendMessageAsUser(
      message.channelId!,
      `%gamba is on global cooldown (wait ${Math.ceil(globalWait / 1000)}s)`,
      message.id
    );
    return;
  }

  const userWait = commands.cooldowns.userRemainingMs('%gamba', message.userInfo, now);
  if (userWait > 0) {
    dispatcher.sendMessageAsUser(
      message.channelId!,
      `%gamba is on cooldown for you (wait ${Math.ceil(userWait / 1000)}s)`,
      message.id
    );
    return;
  }

  const arg = message.text.split(' ')[1];
  const amount = Number(arg);
  if (!arg || Number.isNaN(amount) || amount <= 0) {
    dispatcher.sendMessageAsUser(
      message.channelId!,
      'usage: %gamba <amount> (100 = baseline)',
      message.id
    );
    return;
  }

  if (!(await checkCostAddIfEnough(dispatcher, message.channelId!, username, -amount, message.id)))
    return;

  commands.cooldowns.recordUsage('%gamba', message.userInfo, now);

  dispatcher.sendMessageAsUser(
    message.channelId!,
    `@${username} staked ${amount}VD on the wheel`,
    message.id
  );

  const multiplier = amount / 100;
  enqueueGambaSpin(
    {
      dispatcher,
      channelId: message.channelId!,
      username,
      userId: message.userInfo.userId,
      isMod: message.userInfo.isMod,
      bet: amount,
      commands
    },
    multiplier
  );
}
