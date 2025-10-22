/**
 * Commands that only work if an overlay exists
 */

import { OverlayDispatchers, type OverlayObserver } from './dispatcher';
import { pollCommandHandler } from './poll.svelte';
import {
  blackSilenceStore,
  flashbangStore,
  goodnightKissStore,
  maxwellStore,
  mistakeStore,
  playAudioStore,
  showImageStore
} from './stores.svelte';
import type { CancelTTS, DisableTTS } from '$lib/remoteTTSMessages';
import { getPointsForUser, setPointsForUser } from './pointsInterface';
import { GLOBAL_HEART_STOCK_MARKET, HeartrateStockMarketError } from './heartstockmarket.svelte';
import type { ChatMessage } from '@twurple/chat';
import { PUBLIC_SELF_THOUGHT_URL } from '$env/static/public';
import { checkinUser } from './checkinInterface';
import { ApprovableObserver } from './approvable';

import * as Constants from './constants';
import { playAudio } from '$lib/speech';

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
    if (username === Constants.MAXWELL_USER) {
      dispatcher.sendMessageAsUser(message.channelId!, 'ok');
    } else {
      if (
        !(await checkCostAddIfEnough(
          dispatcher,
          message.channelId!,
          username,
          -Constants.MAXWELL_COST
        ))
      )
        return;
      dispatcher.sendMessageAsUser(message.channelId!, `-${Constants.MAXWELL_COST}`);
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
  dispatcher.sendMessageAsUser(
    message.channelId!,
    `${username} transferred ${amount} to ${target}`
  );
}

function getCostHandler(dispatcher: OverlayDispatchers, message: ChatMessage) {
  const subcommand = message.text.split(' ')[1];

  switch (subcommand) {
    case 'blacksilence':
      dispatcher.sendMessageAsUser(message.channelId!, `${Constants.BLACK_SILENCE_COST}`);
      break;

    case 'flashbang':
      dispatcher.sendMessageAsUser(message.channelId!, `${Constants.FLASHBANG_COST}`);
      break;

    case 'maxwell':
      dispatcher.sendMessageAsUser(message.channelId!, `${Constants.MAXWELL_COST}`);
      break;

    case 'mistake':
      dispatcher.sendMessageAsUser(message.channelId!, `${Constants.MISTAKE_COST}`);
      break;

    case 'showimage':
      dispatcher.sendMessageAsUser(message.channelId!, `${Constants.SHOW_IMAGE_COST}`);
      break;

    case 'selfThought':
      dispatcher.sendMessageAsUser(message.channelId!, `${Constants.SELF_THOUGHT_COST}`);
      break;

    case 'goodnightkiss':
      dispatcher.sendMessageAsUser(message.channelId!, `${Constants.GOOD_NIGHT_KISS_COST}`);
      break;

    default:
      dispatcher.sendMessageAsUser(
        message.channelId!,
        `~ %blacksilence: ${Constants.BLACK_SILENCE_COST}; %flashbang: ${Constants.FLASHBANG_COST}; %maxwell: ${Constants.MAXWELL_COST}; %mistake: ${Constants.MISTAKE_COST}; %showimage: ${Constants.SHOW_IMAGE_COST}; %selfthought: ${Constants.SELF_THOUGHT_COST}`
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

function checkInHandler(
  dispatcher: OverlayDispatchers,
  message: ChatMessage,
  sender: WebSocket | undefined = undefined
) {
  const user = message.userInfo;
  if (!user.userName) return;

  const username = user.userName;
  if (PEOPLE_WHO_CHECKED_IN.includes(user.userName)) {
    dispatcher.sendMessageAsUser(
      message.channelId!,
      `${user.userName} you've already checked in RAGEY`
    );
    return;
  }

  dispatcher.sendMessageAsUser(
    message.channelId!,
    `meow ${user.userName} vedalWave , here's +${Constants.CHECK_IN_POINTS}`
  );
  PEOPLE_WHO_CHECKED_IN.push(user.userName);

  checkCostAddIfEnough(dispatcher, message.channelId!, username, Constants.CHECK_IN_POINTS);
  if (sender) checkinUser(username, sender);
}

async function flashbangHandler(dispatcher: OverlayDispatchers, message: ChatMessage) {
  const user = message.userInfo;
  if (Math.random() < 0.5 || message.userInfo.isBroadcaster) {
    const username = user.userName;
    if (!username) return;

    if (
      await checkCostAddIfEnough(
        dispatcher,
        message.channelId!,
        username,
        -Constants.FLASHBANG_COST
      )
    ) {
      flashbangStore.increment();
      dispatcher.sendMessageAsUser(
        message.channelId!,
        `Throwing a flashbang, -${Constants.FLASHBANG_COST}`
      );
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
    if (username === Constants.BLACK_SILENCE_USER) {
      dispatcher.sendMessageAsUser(message.channelId!, 'ok');
    } else {
      if (
        !(await checkCostAddIfEnough(
          dispatcher,
          message.channelId!,
          username,
          -Constants.BLACK_SILENCE_COST
        ))
      )
        return;
      dispatcher.sendMessageAsUser(message.channelId!, `-${Constants.BLACK_SILENCE_COST}`);
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
          duration: Constants.BLACK_SILENCE_DURATION / 1000
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
    if (username === Constants.MISTAKE_USER) {
      dispatcher.sendMessageAsUser(message.channelId!, 'ok, but i hate u btw');
    } else {
      if (
        !(await checkCostAddIfEnough(
          dispatcher,
          message.channelId!,
          username,
          -Constants.MISTAKE_COST
        ))
      )
        return;
      dispatcher.sendMessageAsUser(message.channelId!, `-${Constants.MISTAKE_COST}`);
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
    if (username === Constants.SHOW_IMAGE_USER) {
      dispatcher.sendMessageAsUser(message.channelId!, 'ok');
      showImageStore.addUrl(imageUrl);
    } else {
      if (
        !(await checkCostAddIfEnough(
          dispatcher,
          message.channelId!,
          username,
          -Constants.SHOW_IMAGE_COST
        ))
      )
        return;
      dispatcher.sendMessageAsUser(message.channelId!, `-${Constants.SHOW_IMAGE_COST}`);

      if (message.userInfo.isMod || message.userInfo.isBroadcaster) {
        showImageStore.addUrl(imageUrl);
      } else {
        dispatcher.sendMessageAsUser(
          message.channelId!,
          '@pastel8844 , @deplytha , @mayoigo_QwQ pls check and approve'
        );

        const approverObserver = new ApprovableObserver(
          dispatcher,
          [Constants.SHOW_IMAGE_USER],
          () => showImageStore.addUrl(imageUrl),
          () => dispatcher.sendMessageAsUser(message.channelId!, 'lbozo try better next time')
        );
        dispatcher.addObserver(approverObserver);
      }
    }
  })();
}

function playAudioHandler(dispatcher: OverlayDispatchers, message: ChatMessage) {
  if (!message.userInfo.userName) return;

  const username = message.userInfo.userName;
  const args = message.text.replace('  ', ' ').split(' ');

  if (args.length < 1) {
    dispatcher.sendMessageAsUser(message.channelId!, 'insufficient arguments');
    return;
  }

  const audioUrl = args[1];

  (async () => {
    if (username === Constants.SHOW_IMAGE_USER) {
      dispatcher.sendMessageAsUser(message.channelId!, 'ok');
      playAudioStore.addUrl(audioUrl);
    } else {
      if (
        !(await checkCostAddIfEnough(
          dispatcher,
          message.channelId!,
          username,
          -Constants.PLAY_AUDIO_COST
        ))
      )
        return;
      dispatcher.sendMessageAsUser(message.channelId!, `-${Constants.PLAY_AUDIO_COST}`);

      if (message.userInfo.isMod || message.userInfo.isBroadcaster) {
        playAudioStore.addUrl(audioUrl);
      } else {
        dispatcher.sendMessageAsUser(
          message.channelId!,
          '@pastel8844 , @deplytha , @SpookiestSpooks pls check and approve'
        );

        const approverObserver = new ApprovableObserver(
          dispatcher,
          [Constants.PLAY_AUDIO_USER],
          () => playAudioStore.addUrl(audioUrl),
          () => dispatcher.sendMessageAsUser(message.channelId!, 'unfortunate')
        );
        dispatcher.addObserver(approverObserver);
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

  let amount = 0;

  if (args[1].trim() === 'all') {
    switch (operation) {
      case 'uninvest':
        const returns = GLOBAL_HEART_STOCK_MARKET.uninvestAll(username);
        const userPoints = (await getPointsForUser(message.userInfo.userName)) ?? 0;
        await setPointsForUser(message.userInfo.userName, userPoints + returns);
        dispatcher.sendMessageAsUser(
          message.channelId!,
          `${username} successfully uninvested ${returns} (all)`
        );
        return;
      case 'invest':
        const points = await getPointsForUser(username);
        if (!points) {
          dispatcher.sendMessageAsUser(message.channelId!, 'Nothing to invest');
          return;
        }
        amount = points;
        break;
    }
  } else {
    amount = Number(args[1]);
  }

  if (!amount) {
    dispatcher.sendMessageAsUser(message.channelId!, 'i blame Mr_Auto & swizzlerq');
    return;
  }

  if (amount <= 0) {
    dispatcher.sendMessageAsUser(message.channelId!, 'Cannot un-invest a negative / zero amount');
    return;
  }

  switch (operation) {
    case 'invest':
      if (!(await checkCostAddIfEnough(dispatcher, message.channelId!, username, -amount))) return;
      try {
        GLOBAL_HEART_STOCK_MARKET.invest(message.userInfo.userName, amount);
      } catch (e: unknown) {
        dispatcher.sendMessageAsUser(message.channelId!, `${username}, ${e}`);
        console.log(e);
        if (!(await checkCostAddIfEnough(dispatcher, message.channelId!, username, amount))) return;
      }
      dispatcher.sendMessageAsUser(
        message.channelId!,
        `${username} successfully invested ${amount}`
      );
      break;
    case 'uninvest':
      try {
        GLOBAL_HEART_STOCK_MARKET.uninvest(message.userInfo.userName, amount);
      } catch (e: unknown) {
        dispatcher.sendMessageAsUser(message.channelId!, `${username}, ${e}`);
        console.log(e);
        if (!(await checkCostAddIfEnough(dispatcher, message.channelId!, username, amount))) return;
      }

      if (!(await checkCostAddIfEnough(dispatcher, message.channelId!, username, amount))) return;
      dispatcher.sendMessageAsUser(
        message.channelId!,
        `${username} successfully uninvested ${amount}`
      );
  }
}

async function stockHandler(dispatcher: OverlayDispatchers, message: ChatMessage) {
  if (!message.userInfo.userName) return;

  const username = message.userInfo.userName;
  const stock_value = GLOBAL_HEART_STOCK_MARKET.get_current_price_for(username);

  dispatcher.sendMessageAsUser(
    message.channelId!,
    `${username} has ${stock_value} in the heart rate stock market`
  );
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

async function selfThoughtHandler(dispatcher: OverlayDispatchers, message: ChatMessage) {
  const user = message.userInfo;
  if (!message.userInfo.userName) return;
  const username = user.userName;
  if (!username) return;

  const text = message.text.split(' ').slice(1).join(' ');

  if (
    await checkCostAddIfEnough(
      dispatcher,
      message.channelId!,
      username,
      -Constants.SELF_THOUGHT_COST
    )
  ) {
    const msg = encodeURIComponent(text);
    const response = await fetch(`${PUBLIC_SELF_THOUGHT_URL}/processMessage?message=${msg}`);
    if (response.status !== 200) {
      await dispatcher.sendMessageAsUser(
        message.channelId!,
        'Unable to do the self-thought, refunding u'
      );

      const points = (await getPointsForUser(username)) ?? 0;
      await setPointsForUser(username, points + Constants.SELF_THOUGHT_COST);
    } else {
      await dispatcher.sendMessageAsUser(
        message.channelId!,
        `@${username} -${Constants.SELF_THOUGHT_COST}`
      );
    }
  }
}

async function goodnightkissHandler(dispatcher: OverlayDispatchers, message: ChatMessage) {
  const user = message.userInfo;
  if (!message.userInfo.userName) return;
  const username = user.userName;
  if (!username) return;

  const args = message.text.split(' ').slice(1);
  if (args[0] === 'clear' && (message.userInfo.isMod || message.userInfo.isBroadcaster)) {
    goodnightKissStore.reset();
    dispatcher.sendMessageAsUser(message.channelId!, 'Cleared');
    return;
  }

  if (goodnightKissStore.isPopulated()) {
    await dispatcher.sendMessageAsUser(
      message.channelId!,
      'An existing good night kiss already exists'
    );
    return;
  }

  let targetUser = message.userInfo.userName;
  // only the VIP owner can change the target user
  if (message.userInfo.userName === Constants.GOOD_NIGHT_KISS_USER && args[0]) targetUser = args[0];
  else if (args[0]) {
    await dispatcher.sendMessageAsUser(
      message.channelId!,
      'Only the owner of the VIP command can target another person for the good night kiss'
    );
    return;
  }

  if (
    message.userInfo.userName === Constants.GOOD_NIGHT_KISS_USER ||
    (await checkCostAddIfEnough(
      dispatcher,
      message.channelId!,
      username,
      -Constants.SELF_THOUGHT_COST
    ))
  ) {
    goodnightKissStore.setProperties({
      username: targetUser ?? 'no username?',
      color: message.userInfo.color ?? 'lightgrey',
      fast_version: Math.random() < 0.1
    });

    if (message.userInfo.userName === Constants.GOOD_NIGHT_KISS_USER) {
      await dispatcher.sendMessageAsUser(message.channelId!, `...`);
    } else {
      await dispatcher.sendMessageAsUser(
        message.channelId!,
        `why did u claim this -${Constants.GOOD_NIGHT_KISS_COST}`
      );
    }
  } else {
    await dispatcher.sendMessageAsUser(message.channelId!, 'cannot afford this');
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
        checkInHandler(dispatcher, message, this.busWs);
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
      case '%playaudio':
        playAudioHandler(dispatcher, message);
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
      case '%selfthought':
        this.callOnlyIfPastCooldown(() => selfThoughtHandler(dispatcher, message));
        break;
      case '%goodnightkiss':
        goodnightkissHandler(dispatcher, message);
        break;
    }
    return;
  }
}
