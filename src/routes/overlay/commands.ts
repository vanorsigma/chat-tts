/**
 * Commands that only work if an overlay exists
 */

import type { ChatUserstate } from 'tmi.js';
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
  username: string,
  difference: number
): Promise<boolean> {
  const points = (await getPointsForUser(username)) ?? 0;

  if (points + difference >= 0) {
    await setPointsForUser(username, points + difference);
    return true;
  } else {
    dispatcher.sendMessageAsUser(`${username}, you can't afford this`);
    return false;
  }
}

async function maxwellHandler(dispatcher: OverlayDispatchers, user: ChatUserstate) {
  if (!user.username) return;

  const username = user.username;

  (async () => {
    if (username === MAXWELL_USER) {
      dispatcher.sendMessageAsUser('ok');
    } else {
      if (!(await checkCostAddIfEnough(dispatcher, username, -MAXWELL_COST))) return;
      dispatcher.sendMessageAsUser(`-${MAXWELL_COST}`);
    }

    maxwellStore.increment();
  })();
}

async function transferHandler(
  dispatcher: OverlayDispatchers,
  user: ChatUserstate,
  message: string
) {
  const splits = message.split(' ');
  const target = splits[1].toLowerCase();
  const amount = Number(splits[2]);

  if (!user.username) return;

  const username = user.username;

  if (amount <= 0) {
    dispatcher.sendMessageAsUser('Must transfer a positive amount');
    return;
  }

  if (!(await checkCostAddIfEnough(dispatcher, username, -amount))) return;
  const points = (await getPointsForUser(target)) ?? 0;
  await setPointsForUser(target, points + amount);
  dispatcher.sendMessageAsUser(`${username} transferred ${amount} to ${target}`);
}

function getCostHandler(dispatcher: OverlayDispatchers, message: string) {
  const subcommand = message.split(' ')[1];

  switch (subcommand) {
    case 'blacksilence':
      dispatcher.sendMessageAsUser(`${BLACK_SILENCE_COST}`);
      break;

    case 'flashbang':
      dispatcher.sendMessageAsUser(`${FLASHBANG_COST}`);
      break;

    case 'maxwell':
      dispatcher.sendMessageAsUser(`${MAXWELL_COST}`);
      break;

    case 'mistake':
      dispatcher.sendMessageAsUser(`${MISTAKE_COST}`);
      break;

    default:
      dispatcher.sendMessageAsUser(
        `~ %blacksilence: ${BLACK_SILENCE_COST}; %flashbang: ${FLASHBANG_COST}; %maxwell: ${MAXWELL_COST}; %mistake: ${MISTAKE_COST}`
      );
      break;
  }
}

async function givePointsHandler(
  dispatcher: OverlayDispatchers,
  user: ChatUserstate,
  message: string
) {
  if (!user.username) return;
  if (!user.badges?.broadcaster) return;

  const splitted = message.split(' ');
  const target = splitted[1];
  const cost = Number(splitted[2]);

  const points = (await getPointsForUser(target)) ?? 0;
  await setPointsForUser(target, points + cost);
  dispatcher.sendMessageAsUser(`given ${cost} to ${target}`);
}

function getPointsHandler(dispatcher: OverlayDispatchers, user: ChatUserstate, message: string) {
  if (!user.username) return;

  const username = user.username;
  const target = message.split(' ').at(1) ?? username;

  // immediate async execution
  (async () => {
    const points = await getPointsForUser(target);
    dispatcher.sendMessageAsUser(`${target} has ${points} meowDollars`);
  })();
}

function checkInHandler(dispatcher: OverlayDispatchers, user: ChatUserstate) {
  if (!user.username) return;

  const username = user.username;
  if (PEOPLE_WHO_CHECKED_IN.includes(user.username)) {
    dispatcher.sendMessageAsUser(`${user.username} you've already checked in RAGEY`);
    return;
  }

  dispatcher.sendMessageAsUser(`meow ${user.username} vedalWave , here's +${CHECK_IN_POINTS}`);
  PEOPLE_WHO_CHECKED_IN.push(user.username);

  checkCostAddIfEnough(dispatcher, username, CHECK_IN_POINTS);
}

async function flashbangHandler(dispatcher: OverlayDispatchers, user: ChatUserstate) {
  if (Math.random() < 0.5) {
    const username = user.username;
    if (!username) return;

    if (await checkCostAddIfEnough(dispatcher, username, -FLASHBANG_COST)) {
      flashbangStore.increment();
      dispatcher.sendMessageAsUser(`Throwing a flashbang, -${FLASHBANG_COST}`);
    }
  } else {
    dispatcher.sendMessageAsUser('NO xdHAH');
  }
}

function blackSilenceHandler(dispatcher: OverlayDispatchers, user: ChatUserstate, ws: WebSocket) {
  if (!user.username) return;

  const username = user.username;

  (async () => {
    if (username === BLACK_SILENCE_USER) {
      dispatcher.sendMessageAsUser('ok');
    } else {
      if (!(await checkCostAddIfEnough(dispatcher, username, -BLACK_SILENCE_COST))) return;
      dispatcher.sendMessageAsUser(`-${BLACK_SILENCE_COST}`);
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

function mistakeHandler(dispatcher: OverlayDispatchers, user: ChatUserstate) {
  if (!user.username) return;

  const username = user.username;

  (async () => {
    if (username === MISTAKE_USER) {
      dispatcher.sendMessageAsUser('ok, but i hate u btw');
    } else {
      if (!(await checkCostAddIfEnough(dispatcher, username, -MISTAKE_COST))) return;
      dispatcher.sendMessageAsUser(`-${MISTAKE_COST}`);
    }

    mistakeStore.increment();
  })();
}

function showImageHandler(dispatcher: OverlayDispatchers, user: ChatUserstate, message: string) {
  if (!user.username) return;

  const username = user.username;
  const args = message.replace('  ', ' ').split(' ');

  if (args.length < 1) {
    dispatcher.sendMessageAsUser('insufficient arguments');
    return;
  }

  const imageUrl = args[1];

  (async () => {
    if (username === SHOW_IMAGE_USER) {
      dispatcher.sendMessageAsUser('ok');
      showImageStore.addUrl(imageUrl);
    } else {
      if (!(await checkCostAddIfEnough(dispatcher, username, -SHOW_IMAGE_COST))) return;
      dispatcher.sendMessageAsUser(`-${SHOW_IMAGE_COST}`);

      if (user.badges?.moderator || user.badges?.broadcaster) {
        showImageStore.addUrl(imageUrl);
      } else {
        dispatcher.sendMessageAsUser(
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
  user: ChatUserstate,
  message: string,
  operation: 'invest' | 'uninvest'
) {
  if (!user.username) return;

  const username = user.username;
  const args = message.replace('  ', ' ').split(' ');
  if (args.length < 1) {
    dispatcher.sendMessageAsUser('insufficient arguments');
    return;
  }

  const amount = Number(args[1]);

  if (!amount) {
    dispatcher.sendMessageAsUser('i blame Mr_Auto & swizzlerq');
    return;
  }

  if (amount <= 0) {
    dispatcher.sendMessageAsUser('Cannot un-invest a negative amount');
    return;
  }

  try {
    switch (operation) {
      case 'invest':
        if (!(await checkCostAddIfEnough(dispatcher, username, -amount))) return;
        GLOBAL_HEART_STOCK_MARKET.invest(user.username, amount);
        dispatcher.sendMessageAsUser(`${username} successfully invested ${amount}`);
        break;
      case 'uninvest':
        GLOBAL_HEART_STOCK_MARKET.uninvest(user.username, amount);
        const points = (await getPointsForUser(user.username)) ?? 0;
        await setPointsForUser(user.username, points + amount);
    }
  } catch (e: unknown) {
    if (e instanceof HeartrateStockMarketError) dispatcher.sendMessageAsUser(`${username}, ${e}`);
    else console.error(e);
  }
}

async function stockHandler(
  dispatcher: OverlayDispatchers,
  user: ChatUserstate,
  message: string,
) {
  if (!user.username) return;

  const username = user.username;
  const stock_value = GLOBAL_HEART_STOCK_MARKET.get_current_price_for(username);

  dispatcher.sendMessageAsUser(`${username} has ${stock_value} in the heart rate stock market`);
}

async function closeMarketHandler(
  dispatcher: OverlayDispatchers,
  user: ChatUserstate,
  message: string
) {
  if (!user.username) return;

  if (user.badges?.broadcaster) {
    const returns = GLOBAL_HEART_STOCK_MARKET.close();
    for (const user_return of returns) {
      const points = (await getPointsForUser(user_return.user)) ?? 0;
      await setPointsForUser(user_return.user, points + user_return.currency);
    }
    await dispatcher.sendMessageAsUser('Stock market closed!');
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

  onMessage(user: ChatUserstate, message: string): void {
    if (!this.dispatchers) {
      throw new Error('No dispatcher');
    }

    const dispatcher = this.dispatchers;
    const commandIndicator = message.split(' ')[0];
    switch (commandIndicator) {
      case '%poll':
        this.callOnlyIfPastCooldown(() => pollCommandHandler(dispatcher, user, message));
        break;
      case '%checkin':
        checkInHandler(dispatcher, user);
        break;
      case '%flashbang':
        this.callOnlyIfPastCooldown(() => flashbangHandler(dispatcher, user));
        break;
      case '%blacksilence':
        if (this.busWs) blackSilenceHandler(dispatcher, user, this.busWs);
        else dispatcher.sendMessageAsUser("tell vanor he's dumb");
        break;
      case '%points':
        getPointsHandler(dispatcher, user, message);
        break;
      case '%cost':
        getCostHandler(dispatcher, message);
        break;
      case '%givepoints':
        givePointsHandler(dispatcher, user, message);
        break;
      case '%transfer':
        transferHandler(dispatcher, user, message);
        break;
      case '%maxwell':
        maxwellHandler(dispatcher, user);
        break;
      case '%mistake':
        mistakeHandler(dispatcher, user);
        break;
      case '%showimage':
        showImageHandler(dispatcher, user, message);
        break;
      case '%invest':
        investHandler(dispatcher, user, message, 'invest');
        break;
      case '%uninvest':
        investHandler(dispatcher, user, message, 'uninvest');
        break;
      case '%stock':
        stockHandler(dispatcher, user, message);
        break;
      case '%closemarket':
        closeMarketHandler(dispatcher, user, message);
        break;
    }
    return;
  }
}
