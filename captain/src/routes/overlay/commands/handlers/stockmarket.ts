import type { OverlayDispatchers } from '../../dispatcher';
import type { ChatMessage } from '@twurple/chat';
import { requireUsername } from './shared';
import { GLOBAL_STOCK_MARKET } from '../../stock/market';
import { timeoutSecondsForFailChance } from '../chance';
import { PEOPLE_WHO_CHECKED_IN } from '../middleware';
import type { Commands } from '..';

export async function buyHandler(
  commands: Commands,
  dispatcher: OverlayDispatchers,
  message: ChatMessage
) {
  const username = requireUsername(message);
  if (!username) return;

  const args = message.text.replaceAll('  ', ' ').split(' ').slice(1);
  if (args.length < 2) {
    dispatcher.sendMessageAsUser(
      message.channelId!,
      'usage: %buy <symbol> <points> [overpay] (or "all" for all vanorDollars)',
      message.id
    );
    return;
  }

  const stock = args[0].toUpperCase();
  const pointsArg = args[1];
  const overpayArg = args[2];
  const overpay = overpayArg ? Number(overpayArg) : 0;
  if (overpayArg !== undefined && (Number.isNaN(overpay) || overpay < 0)) {
    dispatcher.sendMessageAsUser(message.channelId!, 'invalid overpay amount', message.id);
    return;
  }

  if (PEOPLE_WHO_CHECKED_IN.length < 5) {
    dispatcher.sendMessageAsUser(message.channelId!, 'no one has checked in yet', message.id);
    return;
  }

  if (!GLOBAL_STOCK_MARKET.approvedStocks().includes(stock)) {
    dispatcher.sendMessageAsUser(
      message.channelId!,
      `unknown stock: ${stock}. approved: ${GLOBAL_STOCK_MARKET.approvedStocks().join(', ')}`,
      message.id
    );
    return;
  }

  const skipChance = message.userInfo.isBroadcaster;
  const now = Date.now();
  const userCooldownMs = 60_000;
  const lastUser = commands.buyUserCooldowns.get(username) ?? 0;
  if (now < lastUser + userCooldownMs) {
    dispatcher.sendMessageAsUser(
      message.channelId!,
      `%buy is on cooldown for you (wait ${Math.ceil((lastUser + userCooldownMs - now) / 1000)}s)`,
      message.id
    );
    return;
  }

  try {
    const result =
      pointsArg === 'all'
        ? await GLOBAL_STOCK_MARKET.buyAll(username, stock, skipChance)
        : await (() => {
            const pts = Number(pointsArg);
            if (Number.isNaN(pts) || pts <= 0) return null;
            return GLOBAL_STOCK_MARKET.buy(username, stock, pts, skipChance, overpay);
          })();

    if (!result) {
      dispatcher.sendMessageAsUser(message.channelId!, 'invalid points amount', message.id);
      return;
    }

    if (!result.ok) {
      if (result.error) {
        dispatcher.sendMessageAsUser(message.channelId!, `buy failed: ${result.error}`, message.id);
        return;
      }

      const failChance = result.failChance ?? 0;
      const timeoutSec = timeoutSecondsForFailChance(failChance);
      const channelId = message.channelId!;
      const userId = message.userInfo.userId;
      commands.buyUserCooldowns.set(username, now);
      dispatcher.sendMessageAsUser(
        channelId,
        `@${username} fumbled %buy ${stock} (${failChance}% fail chance, investing: ${result.invested ?? '?'} VD) -> timeout ${timeoutSec}s`,
        message.id
      );
      try {
        await dispatcher.timeoutUser(channelId, userId, 'stock buy failed', timeoutSec, message.userInfo.isMod);
      } catch (e) {
        console.warn(`failed to timeout ${username}:`, e);
      }
      return;
    }

    commands.buyUserCooldowns.set(username, now);
    dispatcher.sendMessageAsUser(
      message.channelId!,
      `@${username} invested ${result.invested}VD in ${stock} @ ${result.price!.toFixed(2)} ${stock}`,
      message.id
    );
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e);
    dispatcher.sendMessageAsUser(message.channelId!, `buy failed: ${errMsg}`, message.id);
  }
}

function formatProfitSign(profit: number): string {
  return profit >= 0 ? '+' : '';
}

export async function sellHandler(dispatcher: OverlayDispatchers, message: ChatMessage) {
  const username = requireUsername(message);
  if (!username) return;

  if (PEOPLE_WHO_CHECKED_IN.length === 0) {
    dispatcher.sendMessageAsUser(message.channelId!, 'no one has checked in yet', message.id);
    return;
  }

  const args = message.text.replaceAll('  ', ' ').split(' ').slice(1);

  function isNumber(s: string): boolean {
    return !Number.isNaN(Number(s)) && Number(s) > 0;
  }

  try {
    let result;

    if (args.length === 0) {
      result = await GLOBAL_STOCK_MARKET.sell(username);
    } else if (args.length === 1) {
      if (args[0] === 'all') {
        result = await GLOBAL_STOCK_MARKET.sellAll(username);
      } else if (isNumber(args[0])) {
        result = await GLOBAL_STOCK_MARKET.sellAmount(username, undefined, Number(args[0]));
      } else {
        result = await GLOBAL_STOCK_MARKET.sell(username, args[0].toUpperCase());
      }
    } else if (args.length === 2) {
      if (args[1] === 'all') {
        result = await GLOBAL_STOCK_MARKET.sellAll(username, args[0].toUpperCase());
      } else if (isNumber(args[1])) {
        result = await GLOBAL_STOCK_MARKET.sellAmount(
          username,
          args[0].toUpperCase(),
          Number(args[1])
        );
      } else {
        dispatcher.sendMessageAsUser(
          message.channelId!,
          'usage: %sell [stock] [amount|all]',
          message.id
        );
        return;
      }
    } else {
      dispatcher.sendMessageAsUser(
        message.channelId!,
        'usage: %sell [stock] [amount|all]',
        message.id
      );
      return;
    }

    if (!result.ok) {
      dispatcher.sendMessageAsUser(
        message.channelId!,
        `sell failed: ${result.error ?? 'unknown error'}`,
        message.id
      );
      return;
    }

    const details = result.details!;
    if (details.length === 1) {
      const d = details[0];
      const sign = formatProfitSign(d.profit);
      const partial = d.remaining ? ` (${d.remaining}VD left)` : '';
      dispatcher.sendMessageAsUser(
        message.channelId!,
        `@${username} sold ${d.stock} for ${d.returned}VD (${sign}${d.profit}${partial} | bought @ ${d.oldPrice.toFixed(2)} ${d.stock}, sold @ ${d.newPrice.toFixed(2)} ${d.stock})`,
        message.id
      );
    } else {
      const totalProfit = details.reduce((sum, d) => sum + d.profit, 0);
      const sign = formatProfitSign(totalProfit);
      const stocks = [...new Set(details.map((d) => d.stock))].join(', ');
      dispatcher.sendMessageAsUser(
        message.channelId!,
        `@${username} sold ${details.length} holdings (${stocks}) for ${result.totalReturned}VD (${sign}${totalProfit})`,
        message.id
      );
    }
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e);
    dispatcher.sendMessageAsUser(message.channelId!, `sell failed: ${errMsg}`, message.id);
  }
}

export async function stocksHandler(dispatcher: OverlayDispatchers, message: ChatMessage) {
  const username = requireUsername(message);
  if (!username) return;

  const pos = await GLOBAL_STOCK_MARKET.getHoldings(username);

  if (pos.holdings.length === 0) {
    dispatcher.sendMessageAsUser(
      message.channelId!,
      `${username} has no stock holdings`,
      message.id
    );
    return;
  }

  const lines = pos.holdings.map((h) => {
    const cur = h.currentPrice?.toFixed(2) ?? '?';
    const p = h.profit !== null ? `${formatProfitSign(h.profit)}${h.profit}` : '?';
    return `${h.stock} (now ${cur}): ${h.investedPoints}VD(${p}) @ ${h.buyPrice.toFixed(2)} ${h.stock}`;
  });

  dispatcher.sendMessageAsUser(message.channelId!, `${username}: ${lines.join(' | ')}`, message.id);
}

export async function endStreamHandler(dispatcher: OverlayDispatchers, message: ChatMessage) {
  const username = requireUsername(message);
  if (!username) return;

  if (!message.userInfo.isBroadcaster) {
    dispatcher.sendMessageAsUser(
      message.channelId!,
      'only the broadcaster can end the stream',
      message.id
    );
    return;
  }

  dispatcher.sendMessageAsUser(
    message.channelId!,
    'stream session ended. stock holdings remain open.',
    message.id
  );
}
