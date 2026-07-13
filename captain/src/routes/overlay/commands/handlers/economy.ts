import type { ChatMessage } from '@twurple/chat';
import type { OverlayDispatchers } from '../../dispatcher';
import { checkCostAddIfEnough, PEOPLE_WHO_CHECKED_IN } from '../middleware';
import { requireUsername } from './shared';
import { getPointsForUser } from '$lib/api/points';
import { getOverlayConfig } from '../../constants';
import { checkinUser } from '../../checkinInterface';

export async function transferHandler(dispatcher: OverlayDispatchers, message: ChatMessage) {
  const username = requireUsername(message);
  if (!username) return;

  const args = message.text.split(' ').slice(1);
  if (args.length < 2) {
    dispatcher.sendMessageAsUser(message.channelId!, 'insufficient arguments', message.id);
    return;
  }
  const target = args[0].toLowerCase();
  const amount = Number(args[1]);

  if (target === username) {
    dispatcher.sendMessageAsUser(message.channelId!, 'cant transfer to yourself', message.id);
    return;
  }

  if (Number.isNaN(amount) || amount <= 0) {
    dispatcher.sendMessageAsUser(message.channelId!, 'invalid amount', message.id);
    return;
  }

  if (
    !(await checkCostAddIfEnough(
      dispatcher,
      message.channelId!,
      username,
      -amount,
      undefined,
      message.id
    ))
  )
    return;
  (await checkCostAddIfEnough(
    dispatcher,
    message.channelId!,
    target,
    amount,
    undefined,
    message.id
  ))!;

  dispatcher.sendMessageAsUser(
    message.channelId!,
    `@${username} transferred ${amount} to ${target}`,
    message.id
  );
}

export async function givePointsHandler(dispatcher: OverlayDispatchers, message: ChatMessage) {
  const username = requireUsername(message);
  if (!username) return;
  if (!message.userInfo.isBroadcaster) return;

  const splitted = message.text.split(' ');
  const target = splitted[1];
  const points = Number(splitted[2]);
  if (!target || Number.isNaN(points)) {
    dispatcher.sendMessageAsUser(message.channelId!, 'invalid arguments', message.id);
    return;
  }

  (await checkCostAddIfEnough(
    dispatcher,
    message.channelId!,
    target,
    points,
    undefined,
    message.id
  ))!;
  dispatcher.sendMessageAsUser(message.channelId!, `given ${points} to ${target}`, message.id);
}

export function getPointsHandler(dispatcher: OverlayDispatchers, message: ChatMessage) {
  const username = requireUsername(message);
  if (!username) return;
  const target = message.text.split(' ').at(1) ?? username;

  (async () => {
    const points = (await getPointsForUser(target)) ?? 0;
    dispatcher.sendMessageAsUser(message.channelId!, `${target} has ${points} meowDollars`);
  })();
}

export async function checkInHandler(
  dispatcher: OverlayDispatchers,
  message: ChatMessage,
  sender: WebSocket | undefined = undefined
) {
  const username = requireUsername(message);
  if (!username) return;

  if (PEOPLE_WHO_CHECKED_IN.includes(username)) {
    dispatcher.sendMessageAsUser(message.channelId!, `you've already checked in RAGEY`, message.id);
    return;
  }

  dispatcher.sendMessageAsUser(
    message.channelId!,
    `vedalWave @${username} here's +${getOverlayConfig().checkIn.points} meow`,
    message.id
  );
  PEOPLE_WHO_CHECKED_IN.push(username);

  (await checkCostAddIfEnough(
    dispatcher,
    message.channelId!,
    username,
    getOverlayConfig().checkIn.points,
    undefined,
    message.id
  ))!;
  if (sender) checkinUser(username, sender);
}
