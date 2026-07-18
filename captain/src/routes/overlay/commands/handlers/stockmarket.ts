import type { OverlayDispatchers } from '../../dispatcher';
import type { ChatMessage } from '@twurple/chat';
import { requireUsername } from './shared';
import { GLOBAL_STOCK_MARKET } from '../../stock/market';

export async function buyHandler(dispatcher: OverlayDispatchers, message: ChatMessage) {
  const username = requireUsername(message);
  if (!username) return;

  const args = message.text.replaceAll('  ', ' ').split(' ').slice(1);
  if (args.length < 3) {
    dispatcher.sendMessageAsUser(
      message.channelId!,
      'usage: %buy <stock> <amount> <price>',
      message.id
    );
    return;
  }

  const stock = args[0].toUpperCase();
  const amount = Number(args[1]);
  const price = Number(args[2]);

  if (Number.isNaN(amount) || amount <= 0 || Number.isNaN(price) || price <= 0) {
    dispatcher.sendMessageAsUser(message.channelId!, 'invalid amount or price', message.id);
    return;
  }

  try {
    const result = await GLOBAL_STOCK_MARKET.buy(username, stock, amount, price);
    let feedback = `bought ${result.matched} shares of ${stock}`;
    if (result.instant) {
      feedback += ' (filled instantly, paid by Kiki!)';
    }
    if (result.placed) {
      feedback += `, order for ${result.placed.amount} shares at ${result.placed.price} placed`;
    }
    dispatcher.sendMessageAsUser(message.channelId!, feedback, message.id);
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e);
    dispatcher.sendMessageAsUser(message.channelId!, `buy failed: ${errMsg}`, message.id);
  }
}

export async function sellHandler(dispatcher: OverlayDispatchers, message: ChatMessage) {
  const username = requireUsername(message);
  if (!username) return;

  const args = message.text.replaceAll('  ', ' ').split(' ').slice(1);
  if (args.length < 3) {
    dispatcher.sendMessageAsUser(
      message.channelId!,
      'usage: %sell <stock> <amount> <price>',
      message.id
    );
    return;
  }

  const stock = args[0].toUpperCase();
  const amount = Number(args[1]);
  const price = Number(args[2]);

  if (Number.isNaN(amount) || amount <= 0 || Number.isNaN(price) || price <= 0) {
    dispatcher.sendMessageAsUser(message.channelId!, 'invalid amount or price', message.id);
    return;
  }

  try {
    const result = await GLOBAL_STOCK_MARKET.sell(username, stock, amount, price);
    let feedback = `sold ${result.matched} shares of ${stock}`;
    if (result.instant) {
      feedback += ' (filled instantly, paid by Kiki!)';
    }
    if (result.placed) {
      feedback += `, sell order for ${result.placed.amount} shares at ${result.placed.price} placed`;
    }
    dispatcher.sendMessageAsUser(message.channelId!, feedback, message.id);
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : String(e);
    dispatcher.sendMessageAsUser(message.channelId!, `sell failed: ${errMsg}`, message.id);
  }
}

export async function stocksHandler(dispatcher: OverlayDispatchers, message: ChatMessage) {
  const username = requireUsername(message);
  if (!username) return;

  const pos = GLOBAL_STOCK_MARKET.userPositions(username);
  const shareLines = Object.entries(pos.shares).map(([stock, shares]) => `${shares}x ${stock}`);

  const buyLines = pos.buyOrders.map((o) => `buy ${o.amount}x ${o.stock} @ ${o.price}`);
  const sellLines = pos.sellOrders.map((o) => `sell ${o.amount}x ${o.stock} @ ${o.price}`);

  const lines: string[] = [];
  if (shareLines.length) lines.push(`Shares: ${shareLines.join(', ')}`);
  if (buyLines.length) lines.push(`Buy orders: ${buyLines.join(', ')}`);
  if (sellLines.length) lines.push(`Sell orders: ${sellLines.join(', ')}`);

  if (lines.length === 0) {
    dispatcher.sendMessageAsUser(
      message.channelId!,
      `${username} has no stocks or orders`,
      message.id
    );
  } else {
    dispatcher.sendMessageAsUser(
      message.channelId!,
      `${username}: ${lines.join(' | ')}`,
      message.id
    );
  }
}

export async function buyOrdersHandler(dispatcher: OverlayDispatchers, message: ChatMessage) {
  const orders = GLOBAL_STOCK_MARKET.randomBuyOrders(5);
  if (orders.length === 0) {
    dispatcher.sendMessageAsUser(message.channelId!, 'no buy orders', message.id);
    return;
  }
  const lines = orders.map((o) => `${o.user}: ${o.amount}x ${o.stock} @ ${o.price}`);
  dispatcher.sendMessageAsUser(message.channelId!, `Buy orders: ${lines.join(' | ')}`, message.id);
}

export async function sellOrdersHandler(dispatcher: OverlayDispatchers, message: ChatMessage) {
  const orders = GLOBAL_STOCK_MARKET.randomSellOrders(5);
  if (orders.length === 0) {
    dispatcher.sendMessageAsUser(message.channelId!, 'no sell orders', message.id);
    return;
  }
  const lines = orders.map((o) => `${o.user}: ${o.amount}x ${o.stock} @ ${o.price}`);
  dispatcher.sendMessageAsUser(message.channelId!, `Sell orders: ${lines.join(' | ')}`, message.id);
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

  const payouts = await GLOBAL_STOCK_MARKET.close();
  const totalPayout = payouts.reduce((sum, p) => sum + p.total, 0);
  const userCount = new Set(payouts.map((p) => p.user)).size;
  dispatcher.sendMessageAsUser(
    message.channelId!,
    `stream ended! paid out ${totalPayout} to ${userCount} users across ${payouts.length} holdings`,
    message.id
  );
}



