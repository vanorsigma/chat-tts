import type { OverlayDispatchers } from '../../dispatcher';
import type { ChatMessage } from '@twurple/chat';
import { checkCostAddIfEnough } from '../middleware';
import { requireUsername } from './shared';
import { getPointsForUser } from '$lib/api/points';
import { GLOBAL_HEART_STOCK_MARKET } from '../../heartstockmarket.svelte';

export async function investHandler(
  dispatcher: OverlayDispatchers,
  message: ChatMessage,
  operation: 'invest' | 'uninvest'
) {
  const username = requireUsername(message);
  if (!username) return;

  const args = message.text.replaceAll('  ', ' ').split(' ').slice(1);
  if (args.length < 1) {
    dispatcher.sendMessageAsUser(message.channelId!, 'insufficient arguments', message.id);
    return;
  }

  let amount = 0;

  if (args[0].trim() === 'all') {
    switch (operation) {
      case 'uninvest': {
        const returns = GLOBAL_HEART_STOCK_MARKET.uninvestAll(username);
        (await checkCostAddIfEnough(
          dispatcher,
          message.channelId!,
          username,
          returns,
          undefined,
          message.id
        ))!;
        dispatcher.sendMessageAsUser(
          message.channelId!,
          `successfully uninvested ${returns} (all)`,
          message.id
        );
        return;
      }
      case 'invest': {
        const points = await getPointsForUser(username);
        if (!points) {
          dispatcher.sendMessageAsUser(message.channelId!, 'nothing to invest', message.id);
          return;
        }
        amount = points;
        break;
      }
    }
  } else {
    amount = Number(args[0]);
  }

  if (Number.isNaN(amount) || amount <= 0) {
    dispatcher.sendMessageAsUser(message.channelId!, 'invalid amount', message.id);
    return;
  }

  switch (operation) {
    case 'invest':
      if (
        !(await checkCostAddIfEnough(
          dispatcher,
          message.channelId!,
          username,
          -amount,
          false,
          message.id
        ))
      )
        return;
      try {
        GLOBAL_HEART_STOCK_MARKET.invest(message.userInfo.userName, amount);
      } catch (e: unknown) {
        dispatcher.sendMessageAsUser(message.channelId!, `${e}`, message.id);
        (await checkCostAddIfEnough(
          dispatcher,
          message.channelId!,
          username,
          amount,
          false,
          message.id
        ))!;
        return;
      }
      dispatcher.sendMessageAsUser(
        message.channelId!,
        `successfully invested ${amount}`,
        message.id
      );
      break;
    case 'uninvest':
      try {
        GLOBAL_HEART_STOCK_MARKET.uninvest(message.userInfo.userName, amount);
      } catch (e: unknown) {
        dispatcher.sendMessageAsUser(message.channelId!, `${e}`, message.id);
        return;
      }
      (await checkCostAddIfEnough(
        dispatcher,
        message.channelId!,
        username,
        amount,
        false,
        message.id
      ))!;
      dispatcher.sendMessageAsUser(
        message.channelId!,
        `successfully uninvested ${amount}`,
        message.id
      );
  }
}

export async function stockHandler(dispatcher: OverlayDispatchers, message: ChatMessage) {
  const username = requireUsername(message);
  if (!username) return;

  const stock_value = GLOBAL_HEART_STOCK_MARKET.get_current_price_for(username);
  dispatcher.sendMessageAsUser(
    message.channelId!,
    `${username} has ${stock_value} in the heart rate stock market`,
    message.id
  );
}

export async function closeMarketHandler(dispatcher: OverlayDispatchers, message: ChatMessage) {
  const username = requireUsername(message);
  if (!username) return;

  if (message.userInfo.isBroadcaster) {
    const returns = GLOBAL_HEART_STOCK_MARKET.close();
    for (const user_return of returns) {
      (await checkCostAddIfEnough(
        dispatcher,
        message.channelId!,
        user_return.user,
        user_return.currency,
        false,
        message.id
      ))!;
    }
    dispatcher.sendMessageAsUser(message.channelId!, 'stock market closed!', message.id);
  }
}
