import type { OverlayDispatchers } from '../../dispatcher';
import type { ChatMessage } from '@twurple/chat';
import type { Commands } from '../index';
import { requireUsername } from './shared';
import { checkCostAddIfEnough } from '../middleware';
import { getLottery, addLotteryEntry } from '$lib/api/lottery';
import { lotteryPayout } from '../../gamba/lottery';

export async function lotteryHandler(
  commands: Commands,
  dispatcher: OverlayDispatchers,
  message: ChatMessage
) {
  const username = requireUsername(message);
  if (!username) return;

  const args = message.text.split(' ').slice(1);

  if (args.length === 0) {
    const { entries, tax } = await getLottery();
    const pool = entries.reduce((sum, e) => sum + e.shares, 0) + tax;
    dispatcher.sendMessageAsUser(
      message.channelId!,
      `Lottery pool: ${pool}VD (${entries.length} participants)`,
      message.id
    );
    return;
  }

  if (args[0]?.toLowerCase() === 'payout') {
    if (!message.userInfo.isBroadcaster) {
      dispatcher.sendMessageAsUser(
        message.channelId!,
        'lottery payout is broadcaster-only',
        message.id
      );
      return;
    }

    await lotteryPayout({
      dispatcher,
      channelId: message.channelId!,
      userId: message.userInfo.userId,
      isMod: message.userInfo.isMod,
      commands,
      messageId: message.id
    });
    return;
  }

  const amount = Number(args[0]);
  if (Number.isNaN(amount) || amount <= 0) {
    dispatcher.sendMessageAsUser(
      message.channelId!,
      'usage: %lottery <amount> | %lottery payout | %lottery',
      message.id
    );
    return;
  }

  const now = Date.now();
  const globalWait = commands.cooldowns.globalRemainingMs('%lottery', message.userInfo, now);
  if (globalWait > 0) {
    dispatcher.sendMessageAsUser(
      message.channelId!,
      `%lottery is on global cooldown (wait ${Math.ceil(globalWait / 1000)}s)`,
      message.id
    );
    return;
  }

  const userWait = commands.cooldowns.userRemainingMs('%lottery', message.userInfo, now);
  if (userWait > 0) {
    dispatcher.sendMessageAsUser(
      message.channelId!,
      `%lottery is on cooldown for you (wait ${Math.ceil(userWait / 1000)}s)`,
      message.id
    );
    return;
  }

  if (!(await checkCostAddIfEnough(dispatcher, message.channelId!, username, -amount, message.id)))
    return;

  commands.cooldowns.recordUsage('%lottery', message.userInfo, now);
  await addLotteryEntry(username, amount);

  const { entries, tax } = await getLottery();
  const pool = entries.reduce((sum, e) => sum + e.shares, 0) + tax;
  dispatcher.sendMessageAsUser(
    message.channelId!,
    `@${username} entered the lottery with ${amount}VD (pool: ${pool}VD)`,
    message.id
  );
}
