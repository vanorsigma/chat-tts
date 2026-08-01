import type { OverlayDispatchers } from '../../dispatcher';
import type { ChatMessage } from '@twurple/chat';
import type { Commands } from '../index';
import { enqueueGambaSpin } from '../../gamba/queue';
import { LotteryWinnerItem } from '../../gamba/gamba';
import { requireUsername } from './shared';
import { checkCostAddIfEnough } from '../middleware';
import { getLottery, addLotteryEntry, clearLottery } from '$lib/api/lottery';

const LOTTERY_USER_COOLDOWN_MS = 60_000;
const lotteryUserCooldowns = new Map<string, number>();

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

    const { entries, tax } = await getLottery();
    if (entries.length === 0) {
      dispatcher.sendMessageAsUser(
        message.channelId!,
        'no participants entered the lottery yet',
        message.id
      );
      return;
    }

    const pool = entries.reduce((sum, e) => sum + e.shares, 0) + tax;
    const items = entries.map((e) => new LotteryWinnerItem(e.shares, e.username, pool));
    await clearLottery();

    dispatcher.sendMessageAsUser(
      message.channelId!,
      `Lottery payout spinning! Pool: ${pool} vanorDollars over ${entries.length} participants`,
      message.id
    );

    enqueueGambaSpin(
      {
        dispatcher,
        channelId: message.channelId!,
        username: 'Lottery',
        userId: message.userInfo.userId,
        isMod: message.userInfo.isMod,
        bet: 0,
        commands
      },
      1,
      items
    );
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
  const lastUser = lotteryUserCooldowns.get(username) ?? 0;
  if (now < lastUser + LOTTERY_USER_COOLDOWN_MS) {
    dispatcher.sendMessageAsUser(
      message.channelId!,
      `%lottery is on cooldown for you (wait ${Math.ceil(
        (lastUser + LOTTERY_USER_COOLDOWN_MS - now) / 1000
      )}s)`,
      message.id
    );
    return;
  }

  if (!(await checkCostAddIfEnough(dispatcher, message.channelId!, username, -amount, message.id)))
    return;

  lotteryUserCooldowns.set(username, now);
  await addLotteryEntry(username, amount);

  const { entries, tax } = await getLottery();
  const pool = entries.reduce((sum, e) => sum + e.shares, 0) + tax;
  dispatcher.sendMessageAsUser(
    message.channelId!,
    `@${username} entered the lottery with ${amount}VD (pool: ${pool}VD)`,
    message.id
  );
}
