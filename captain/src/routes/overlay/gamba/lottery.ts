import { getLottery, clearLottery } from '$lib/api/lottery';
import { enqueueGambaSpin } from './queue';
import { LotteryWinnerItem, type CommandsLike } from './gamba';
import type { OverlayDispatchers } from '../dispatcher';

export interface LotteryPayoutContext {
  dispatcher: OverlayDispatchers;
  channelId: string;
  userId?: string;
  isMod?: boolean;
  commands?: CommandsLike;
  messageId?: string;
}

export async function lotteryPayout(ctx: LotteryPayoutContext): Promise<void> {
  const { entries, tax } = await getLottery();
  if (entries.length === 0) {
    ctx.dispatcher.sendMessageAsUser(
      ctx.channelId,
      'no participants entered the lottery yet',
      ctx.messageId
    );
    return;
  }

  const pool = entries.reduce((sum, e) => sum + e.shares, 0) + tax;
  const items = entries.map((e) => new LotteryWinnerItem(e.shares, e.username, pool));
  await clearLottery();

  const { dispatcher, channelId, userId, isMod, commands, messageId } = ctx;
  dispatcher.sendMessageAsUser(
    channelId,
    `Lottery payout spinning! Pool: ${pool} vanorDollars over ${entries.length} participants`,
    messageId
  );

  enqueueGambaSpin(
    { dispatcher, channelId, username: 'Lottery', userId, isMod, bet: 0, commands },
    1,
    items
  );
}
