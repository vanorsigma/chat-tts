/**
 * Commands that only work if an overlay exists
 */

import { OverlayDispatchers, type OverlayObserver } from './dispatcher';
import { pollCommandHandler } from './poll.svelte';
import {
  blackSilenceStore,
  flashbangStore,
  maxwellStore,
  mistakeStore,
  showImageStore
} from './stores.svelte';
import type { CancelTTS, DisableTTS } from '$lib/remoteTTSMessages';
import { getPointsForUser, setPointsForUser } from './pointsInterface';
import { ShowImageObserver } from './showImage';
import { GLOBAL_HEART_STOCK_MARKET, HeartrateStockMarketError } from './heartstockmarket.svelte';
import type { ChatMessage } from '@twurple/chat';

export const BLACK_SILENCE_USER = 'nikitakik228';
export const BLACK_SILENCE_DURATION = 10 * 1000;
export const BLACK_SILENCE_COST = 500;

export const FLASHBANG_COST = 50;

export const MAXWELL_COST = 100;
export const MAXWELL_USER = '5kuli';

export const MISTAKE_COST = 1000;
export const MISTAKE_USER = 'mr_auto';

export const SHOW_IMAGE_COST = 2000;
export const SHOW_IMAGE_USER = 'mayoigo_qwq';

export const CHECK_IN_POINTS = 999.99;

const COOLDOWN = 10 * 1000;
const PEOPLE_WHO_CHECKED_IN: string[] = [];

async function checkCostAddIfEnough(
  dispatcher: OverlayDispatchers,
  broadcaster_id: string,
  username: string,
  difference: number
): Promise<boolean> {
  const points = (await getPointsForUser(username)) ?? 0;

  if (points + difference >= 0) {
    await setPointsForUser(username, points + difference);
    return true;
  } else {
    dispatcher.sendMessageAsUser(broadcaster_id, `${username}, you can't afford this`);
    return false;
  }
}

async function maxwellHandler(dispatcher: OverlayDispatchers, message: ChatMessage) {
  const user = message.userInfo;
  if (!user.userName) return;

  const username = user.userName;

  (async () => {
    if (username === MAXWELL_USER) {
      dispatcher.sendMessageAsUser(message.channelId!, 'ok');
    } else {
      if (!(await checkCostAddIfEnough(dispatcher, message.channelId!, username, -MAXWELL_COST))) return;
      dispatcher.sendMessageAsUser(message.channelId!, `-${MAXWELL_COST}`);
    }

    maxwellStore.increment();
  })();
}

async function transferHandler(dispatcher: OverlayDispatchers, message: ChatMessage) {
  const splits = message.text.split(' ');
  const target = splits[1].toLowerCase();
  const amount = Number(splits[2]);

  if (!message.userInfo.userName) return;

  const username = message.userInfo.userName;

  if (amount <= 0) {
    dispatcher.sendMessageAsUser(message.channelId!, 'Must transfer a positive amount');
    return;
  }

  if (!(await checkCostAddIfEnough(dispatcher, message.channelId!, username, -amount))) return;
  const points = (await getPointsForUser(target)) ?? 0;
  await setPointsForUser(target, points + amount);
  dispatcher.sendMessageAsUser(message.channelId!, `${username} transferred ${amount} to ${target}`);
}

function getCostHandler(dispatcher: OverlayDispatchers, message: ChatMessage) {
  const subcommand = message.text.split(' ')[1];

  switch (subcommand) {
    case 'blacksilence':
      dispatcher.sendMessageAsUser(message.channelId!, `${BLACK_SILENCE_COST}`);
      break;

    case 'flashbang':
      dispatcher.sendMessageAsUser(message.channelId!, `${FLASHBANG_COST}`);
      break;

    case 'maxwell':
      dispatcher.sendMessageAsUser(message.channelId!, `${MAXWELL_COST}`);
      break;

    case 'mistake':
      dispatcher.sendMessageAsUser(message.channelId!, `${MISTAKE_COST}`);
      break;

    default:
      dispatcher.sendMessageAsUser(
        message.channelId!,
        `~ %blacksilence: ${BLACK_SILENCE_COST}; %flashbang: ${FLASHBANG_COST}; %maxwell: ${MAXWELL_COST}; %mistake: ${MISTAKE_COST}`
      );
      break;
  }
}

async function givePointsHandler(dispatcher: OverlayDispatchers, message: ChatMessage) {
  if (!message.userInfo.userName) return;
  if (!message.userInfo.isBroadcaster) return;

  const splitted = message.text.split(' ');
  const target = splitted[1];
  const cost = Number(splitted[2]);

  const points = (await getPointsForUser(target)) ?? 0;
  await setPointsForUser(target, points + cost);
  dispatcher.sendMessageAsUser(message.channelId!, `given ${cost} to ${target}`);
}

function getPointsHandler(dispatcher: OverlayDispatchers, message: ChatMessage) {
  if (!message.userInfo.userName) return;

  const username = message.userInfo.userName;
  const target = message.text.split(' ').at(1) ?? username;

  // immediate async execution
  (async () => {
    const points = await getPointsForUser(target);
    dispatcher.sendMessageAsUser(message.channelId!, `${target} has ${points} meowDollars`);
  })();
}

function checkInHandler(dispatcher: OverlayDispatchers, message: ChatMessage) {
  const user = message.userInfo;
  if (!user.userName) return;

  const username = user.userName;
  if (PEOPLE_WHO_CHECKED_IN.includes(user.userName)) {
    dispatcher.sendMessageAsUser(message.channelId!, `${user.userName} you've already checked in RAGEY`);
    return;
  }

  dispatcher.sendMessageAsUser(message.channelId!, `meow ${user.userName} vedalWave , here's +${CHECK_IN_POINTS}`);
  PEOPLE_WHO_CHECKED_IN.push(user.userName);

  checkCostAddIfEnough(dispatcher, message.channelId!, username, CHECK_IN_POINTS);
}

async function flashbangHandler(dispatcher: OverlayDispatchers, message: ChatMessage) {
  const user = message.userInfo;
  if (Math.random() < 0.5) {
    const username = user.userName;
    if (!username) return;

    if (await checkCostAddIfEnough(dispatcher, message.channelId!, username, -FLASHBANG_COST)) {
      flashbangStore.increment();
      dispatcher.sendMessageAsUser(message.channelId!, `Throwing a flashbang, -${FLASHBANG_COST}`);
    }
  } else {
    dispatcher.sendMessageAsUser(message.channelId!, 'NO xdHAH');
  }
}

function blackSilenceHandler(dispatcher: OverlayDispatchers, message: ChatMessage, ws: WebSocket) {
  const user = message.userInfo;
  if (!user.userName) return;

  const username = user.userName;

  (async () => {
    if (username === BLACK_SILENCE_USER) {
      dispatcher.sendMessageAsUser(message.channelId!, 'ok');
    } else {
      if (!(await checkCostAddIfEnough(dispatcher, message.channelId!, username, -BLACK_SILENCE_COST))) return;
      dispatcher.sendMessageAsUser(message.channelId!, `-${BLACK_SILENCE_COST}`);
    }

    blackSilenceStore.increment();

    ws.send(
      JSON.stringify({
        type: 'tts',
        command: {
          type: 'cancel'
        }
      } as CancelTTS)
    );

    ws.send(
      JSON.stringify({
        type: 'tts',
        command: {
          type: 'disable',
          duration: BLACK_SILENCE_DURATION / 1000
        }
      } as DisableTTS)
    );
  })();
}

function mistakeHandler(dispatcher: OverlayDispatchers, message: ChatMessage) {
  const user = message.userInfo;
  if (!user.userName) return;

  const username = user.userName;

  (async () => {
    if (username === MISTAKE_USER) {
      dispatcher.sendMessageAsUser(message.channelId!, 'ok, but i hate u btw');
    } else {
      if (!(await checkCostAddIfEnough(dispatcher, message.channelId!, username, -MISTAKE_COST))) return;
      dispatcher.sendMessageAsUser(message.channelId!, `-${MISTAKE_COST}`);
    }

    mistakeStore.increment();
  })();
}

function showImageHandler(dispatcher: OverlayDispatchers, message: ChatMessage) {
  if (!message.userInfo.userName) return;

  const username = message.userInfo.userName;
  const args = message.text.replace('  ', ' ').split(' ');

  if (args.length < 1) {
    dispatcher.sendMessageAsUser(message.channelId!, 'insufficient arguments');
    return;
  }

  const imageUrl = args[1];

  (async () => {
    if (username === SHOW_IMAGE_USER) {
      dispatcher.sendMessageAsUser(message.channelId!, 'ok');
      showImageStore.addUrl(imageUrl);
    } else {
      if (!(await checkCostAddIfEnough(dispatcher, message.channelId!, username, -SHOW_IMAGE_COST))) return;
      dispatcher.sendMessageAsUser(message.channelId!, `-${SHOW_IMAGE_COST}`);

      if (message.userInfo.isMod || message.userInfo.isBroadcaster) {
        showImageStore.addUrl(imageUrl);
      } else {
        dispatcher.sendMessageAsUser(
          message.channelId!,
          '@pastel8844 , @deplytha , @mayoigo_QwQ pls check and approve'
        );

        const showImageObserver = new ShowImageObserver(dispatcher, [SHOW_IMAGE_USER], () =>
          showImageStore.addUrl(imageUrl)
        );
        dispatcher.addObserver(showImageObserver);
      }
    }
  })();
}

async function investHandler(
  dispatcher: OverlayDispatchers,
  message: ChatMessage,
  operation: 'invest' | 'uninvest'
) {
  if (!message.userInfo.userName) return;

  const username = message.userInfo.userName;
  const args = message.text.replace('  ', ' ').split(' ');
  if (args.length < 1) {
    dispatcher.sendMessageAsUser(message.channelId!, 'insufficient arguments');
    return;
  }

  const amount = Number(args[1]);

  if (!amount) {
    dispatcher.sendMessageAsUser(message.channelId!, 'i blame Mr_Auto & swizzlerq');
    return;
  }

  if (amount <= 0) {
    dispatcher.sendMessageAsUser(message.channelId!, 'Cannot un-invest a negative amount');
    return;
  }

  try {
    switch (operation) {
      case 'invest':
        if (!(await checkCostAddIfEnough(dispatcher, message.channelId!, username, -amount))) return;
        GLOBAL_HEART_STOCK_MARKET.invest(message.userInfo.userName, amount);
        dispatcher.sendMessageAsUser(message.channelId!, `${username} successfully invested ${amount}`);
        break;
      case 'uninvest':
        GLOBAL_HEART_STOCK_MARKET.uninvest(message.userInfo.userName, amount);
        const points = (await getPointsForUser(message.userInfo.userName)) ?? 0;
        await setPointsForUser(message.userInfo.userName, points + amount);
    }
  } catch (e: unknown) {
    if (e instanceof HeartrateStockMarketError) dispatcher.sendMessageAsUser(message.channelId!, `${username}, ${e}`);
    else console.error(e);
  }
}

async function stockHandler(dispatcher: OverlayDispatchers, message: ChatMessage) {
  if (!message.userInfo.userName) return;

  const username = message.userInfo.userName;
  const stock_value = GLOBAL_HEART_STOCK_MARKET.get_current_price_for(username);

  dispatcher.sendMessageAsUser(message.channelId!, `${username} has ${stock_value} in the heart rate stock market`);
}

async function closeMarketHandler(dispatcher: OverlayDispatchers, message: ChatMessage) {
  if (!message.userInfo.userName) return;

  if (message.userInfo.isBroadcaster) {
    const returns = GLOBAL_HEART_STOCK_MARKET.close();
    for (const user_return of returns) {
      const points = (await getPointsForUser(user_return.user)) ?? 0;
      await setPointsForUser(user_return.user, points + user_return.currency);
    }
    await dispatcher.sendMessageAsUser(message.channelId!, 'Stock market closed!');
  }
}

export class Commands implements OverlayObserver {
  dispatchers?: OverlayDispatchers = undefined;
  nextValid: number = new Date().getTime();

  private busWs?: WebSocket = undefined;

  constructor(dispatchers?: OverlayDispatchers) {
    this.dispatchers = dispatchers;
  }

  setBusURL(url: string) {
    if (this.busWs) {
      this.busWs.close();
    }

    const ws = new WebSocket(url);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ws.onopen = (_) => {
      console.log('ws open');
      this.busWs = ws;
    };

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ws.onclose = (_) => {
      console.log('ws close');
      this.busWs = undefined;
    };
  }

  callOnlyIfPastCooldown(callback: () => void) {
    if (new Date().getTime() >= this.nextValid) {
      callback();
      this.nextValid = new Date().getTime() + COOLDOWN;
    }
  }

  onMessage(message: ChatMessage): void {
    if (!this.dispatchers) {
      throw new Error('No dispatcher');
    }

    const dispatcher = this.dispatchers;
    const commandIndicator = message.text.split(' ')[0];
    switch (commandIndicator) {
      case '%poll':
        this.callOnlyIfPastCooldown(() => pollCommandHandler(dispatcher, message));
        break;
      case '%checkin':
        checkInHandler(dispatcher, message);
        break;
      case '%flashbang':
        this.callOnlyIfPastCooldown(() => flashbangHandler(dispatcher, message));
        break;
      case '%blacksilence':
        if (this.busWs) blackSilenceHandler(dispatcher, message, this.busWs);
        else dispatcher.sendMessageAsUser(message.channelId!, "tell vanor he's dumb");
        break;
      case '%points':
        getPointsHandler(dispatcher, message);
        break;
      case '%cost':
        getCostHandler(dispatcher, message);
        break;
      case '%givepoints':
        givePointsHandler(dispatcher, message);
        break;
      case '%transfer':
        transferHandler(dispatcher, message);
        break;
      case '%maxwell':
        maxwellHandler(dispatcher, message);
        break;
      case '%mistake':
        mistakeHandler(dispatcher, message);
        break;
      case '%showimage':
        showImageHandler(dispatcher, message);
        break;
      case '%invest':
        investHandler(dispatcher, message, 'invest');
        break;
      case '%uninvest':
        investHandler(dispatcher, message, 'uninvest');
        break;
      case '%stock':
        stockHandler(dispatcher, message);
        break;
      case '%closemarket':
        closeMarketHandler(dispatcher, message);
        break;
    }
    return;
  }
}
