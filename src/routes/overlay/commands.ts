/**
 * Commands that only work if an overlay exists
 */

import { OverlayDispatchers, type OverlayObserver } from './dispatcher';
import { pollCommandHandler } from './poll.svelte';
import {
  blackSilenceStore,
  flashbangStore,
  goodnightKissStore,
  karmaStore,
  maxwellStore,
  mistakeStore,
  playAudioStore,
  showImageStore
} from './stores.svelte';
import type { CancelTTS, DisableTTS } from '$lib/remoteTTSMessages';
import { getPointsForUser, setPointsForUser } from './pointsInterface';
import { GLOBAL_HEART_STOCK_MARKET } from './heartstockmarket.svelte';
import type { ChatMessage } from '@twurple/chat';
import { PUBLIC_SELF_THOUGHT_URL, PUBLIC_TARGET_CHANNEL_ID } from '$env/static/public';
import { checkinUser } from './checkinInterface';
import { ApprovableObserver } from './approvable';

import * as Constants from './constants';
import {
  getAttachmentUrlForTag,
  isTagExist,
  registerTag
} from './attachmentsInterface';

const COOLDOWN = 10 * 1000;
const TOGGLE_COOLDOWN = 2 * 60 * 1000;
const PEOPLE_WHO_CHECKED_IN: string[] = [];
const TOGGLE_EXPIRY: Map<string, NodeJS.Timeout> = new Map();

let _checkCostAddIfEnoughLock: Promise<boolean> = Promise.resolve(true);
async function checkCostAddIfEnough(
  dispatcher: OverlayDispatchers,
  broadcaster_id: string,
  username: string,
  difference: number,
  use_stock_market: boolean = true
): Promise<boolean> {
  const currentTask = _checkCostAddIfEnoughLock.then(async () => {
    const points = (await getPointsForUser(username)) ?? 0;

    if (points + difference >= 0) {
      await setPointsForUser(username, points + difference);
      return true;
    }

    if (use_stock_market) {
      try {
        GLOBAL_HEART_STOCK_MARKET.uninvest(username, -difference);
        return true;
      } catch (e: unknown) { }
    }

    //TODO: this should probably be the caller's responsibiility
    dispatcher.sendMessageAsUser(broadcaster_id, `@${username} you can't afford this PoorVanor`);
    return false;
  }).catch((err) => {
    console.error(err);
    return false
  });
  _checkCostAddIfEnoughLock = currentTask;
  return await currentTask
}

async function maxwellHandler(dispatcher: OverlayDispatchers, message: ChatMessage) {
  const user = message.userInfo;
  if (!user.userName) return;

  const username = user.userName;

  (async () => {
    if (username === Constants.MAXWELL_USER) {
      dispatcher.sendMessageAsUser(message.channelId!, `@${username} ok`);
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
      dispatcher.sendMessageAsUser(message.channelId!, `@${username} -${Constants.MAXWELL_COST}`);
    }

    maxwellStore.increment();
  })();
}

async function transferHandler(dispatcher: OverlayDispatchers, message: ChatMessage) {
  const args = message.text.split(' ').slice(1);
  if (args.length < 2) {
    dispatcher.sendMessageAsUser(message.channelId!, `@${message.userInfo.userName} insufficient arguments`);
    return;
  }
  const target = args[0].toLowerCase();
  const amount = Number(args[1]);

  if (!message.userInfo.userName) return;

  const username = message.userInfo.userName;
  if (target === username) {
    dispatcher.sendMessageAsUser(message.channelId!, `@${message.userInfo.userName} cant transfer to yourself`);
    return;
  }

  if (Number.isNaN(amount) || amount <= 0) {
    dispatcher.sendMessageAsUser(message.channelId!, `@${username} invalid amount`);
    return;
  }

  if (!(await checkCostAddIfEnough(dispatcher, message.channelId!, username, -amount))) return;
  (await checkCostAddIfEnough(dispatcher, message.channelId!, target, amount))!

  dispatcher.sendMessageAsUser(
    message.channelId!,
    `@${username} transferred ${amount} to ${target}`
  );
}

function getCostHandler(dispatcher: OverlayDispatchers, message: ChatMessage) {
  const subcommand = message.text.split(' ')[1];
  const username = message.userInfo.userName;

  switch (subcommand) {
    case 'blacksilence':
      dispatcher.sendMessageAsUser(message.channelId!, `@${username} ${Constants.BLACK_SILENCE_COST}`);
      break;

    case 'flashbang':
      dispatcher.sendMessageAsUser(message.channelId!, `@${username} ${Constants.FLASHBANG_COST}`);
      break;

    case 'maxwell':
      dispatcher.sendMessageAsUser(message.channelId!, `@${username} ${Constants.MAXWELL_COST}`);
      break;

    case 'mistake':
      dispatcher.sendMessageAsUser(message.channelId!, `@${username} ${Constants.MISTAKE_COST}`);
      break;

    case 'showimage':
      dispatcher.sendMessageAsUser(message.channelId!, `@${username} ${Constants.SHOW_IMAGE_COST}`);
      break;

    case 'selfthought':
      dispatcher.sendMessageAsUser(message.channelId!, `@${username} ${Constants.SELF_THOUGHT_COST}`);
      break;

    case 'goodnightkiss':
      dispatcher.sendMessageAsUser(message.channelId!, `@${username} ${Constants.GOOD_NIGHT_KISS_COST}`);
      break;

    default:
      dispatcher.sendMessageAsUser(
        message.channelId!,
        `@${username} %blacksilence: ${Constants.BLACK_SILENCE_COST}; %flashbang: ${Constants.FLASHBANG_COST}; %maxwell: ${Constants.MAXWELL_COST}; %mistake: ${Constants.MISTAKE_COST}; %showimage: ${Constants.SHOW_IMAGE_COST}; %selfthought: ${Constants.SELF_THOUGHT_COST}`
      );
      break;
  }
}

async function givePointsHandler(dispatcher: OverlayDispatchers, message: ChatMessage) {
  if (!message.userInfo.userName) return;
  if (!message.userInfo.isBroadcaster) return;

  const splitted = message.text.split(' ');
  const target = splitted[1];
  const points = Number(splitted[2]);
  if (Number.isNaN(points)) return;

  (await checkCostAddIfEnough(dispatcher, message.channelId!, target, points))!;
  dispatcher.sendMessageAsUser(message.channelId!, `@${message.userInfo.userName} given ${points} to ${target}`);
}

function getPointsHandler(dispatcher: OverlayDispatchers, message: ChatMessage) {
  if (!message.userInfo.userName) return;

  const username = message.userInfo.userName;
  const target = message.text.split(' ').at(1) ?? username;

  // immediate async execution
  (async () => {
    const points = await getPointsForUser(target) ?? 0;
    dispatcher.sendMessageAsUser(message.channelId!, `${target} has ${points} meowDollars`);
  })();
}

async function checkInHandler(
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
      `@${user.userName} you've already checked in RAGEY`
    );
    return;
  }

  dispatcher.sendMessageAsUser(
    message.channelId!,
    `vedalWave @${user.userName} here's +${Constants.CHECK_IN_POINTS} meow`
  );
  PEOPLE_WHO_CHECKED_IN.push(user.userName);

  (await checkCostAddIfEnough(dispatcher, message.channelId!, username, Constants.CHECK_IN_POINTS))!;
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
      karmaStore.updateKarma(Constants.FLASHBANG_KARMA, 'Flashbang');
      dispatcher.sendMessageAsUser(
        message.channelId!,
        `@${username} throwing a flashbang, -${Constants.FLASHBANG_COST}`
      );
    }
  } else {
    dispatcher.sendMessageAsUser(message.channelId!, `@${user.userName} NO xdHAH`);
  }
}

function blackSilenceHandler(dispatcher: OverlayDispatchers, message: ChatMessage, ws: WebSocket) {
  const user = message.userInfo;
  if (!user.userName) return;

  const username = user.userName;

  (async () => {
    if (username === Constants.BLACK_SILENCE_USER) {
      dispatcher.sendMessageAsUser(message.channelId!, `@${username} ok`);
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
      dispatcher.sendMessageAsUser(message.channelId!, `@${username} -${Constants.BLACK_SILENCE_COST}`);
    }

    blackSilenceStore.increment();
    karmaStore.updateKarma(Constants.BLACK_SILENCE_KARMA, 'Black Silence');

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
      dispatcher.sendMessageAsUser(message.channelId!, `@${username} ok but i hate u btw`);
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
      dispatcher.sendMessageAsUser(message.channelId!, `@${username} -${Constants.MISTAKE_COST}`);
    }

    mistakeStore.increment();
    karmaStore.updateKarma(Constants.MISTAKE_KARMA, 'Mistake Redeem');
  })();
}

async function showImageHandler(dispatcher: OverlayDispatchers, message: ChatMessage) {
  if (!message.userInfo.userName) return;

  const username = message.userInfo.userName;
  const args = message.text.replace('  ', ' ').split(' ').slice(1);

  if (args.length < 1) {
    dispatcher.sendMessageAsUser(message.channelId!, `@${username} insufficient arguments`);
    return;
  }

  let imageUrl = args[0];
  let optionalTagName = args.at(1);
  let isTag = !imageUrl.startsWith('http');
  // backwards compatibility with {tag} syntax
  if (isTag && imageUrl.startsWith("{") && imageUrl.endsWith("}")) {
    imageUrl = imageUrl.slice(1, -1);
  }

  if (isTag) {
    if (await isTagExist(imageUrl)) {
      imageUrl = getAttachmentUrlForTag(imageUrl);
      optionalTagName = undefined;
    } else {
      dispatcher.sendMessageAsUser(message.channelId!, `@${username} that tag probably doesnt exist`);
      return;
    }
  }

  const addUrl = async () => {
    showImageStore.addUrl(imageUrl);
    try {
      if (optionalTagName) await registerTag(optionalTagName, imageUrl);
    } catch (e) {
      dispatcher.sendMessageAsUser(message.channelId!, `@${username} cannot add tag image: ${e}`);
    }
  };

  (async () => {
    if (username === Constants.SHOW_IMAGE_USER) {
      dispatcher.sendMessageAsUser(message.channelId!, `@${username} ok`);
      addUrl();
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
      dispatcher.sendMessageAsUser(message.channelId!, `@${username} -${Constants.SHOW_IMAGE_COST}`);

      if (message.userInfo.isMod || message.userInfo.isBroadcaster || isTag) {
        addUrl();
      } else {
        const approverObserver = new ApprovableObserver(
          dispatcher,
          message,
          [Constants.SHOW_IMAGE_USER],
          () => addUrl(),
          () => dispatcher.sendMessageAsUser(message.channelId!, `@${username} lbozo try better next time`)
        );
        dispatcher.addObserver(approverObserver);
        karmaStore.updateKarma(Constants.SHOW_IMAGE_KARMA, 'Show Image');
      }
    }
  })();
}

async function playAudioHandler(dispatcher: OverlayDispatchers, message: ChatMessage) {
  if (!message.userInfo.userName) return;

  const username = message.userInfo.userName;
  const args = message.text.replace('  ', ' ').split(' ').slice(1);

  if (args.length < 1) {
    dispatcher.sendMessageAsUser(message.channelId!, `@${username} insufficient arguments`);
    return;
  }

  let audioUrl = args[0];
  let optionalTagName = args.at(1);
  let isTag = !audioUrl.startsWith('http');
  // backwards compatibility with {tag} syntax
  if (isTag && audioUrl.startsWith("{") && audioUrl.endsWith("}")) {
    audioUrl = audioUrl.slice(1, -1);
  }

  if (isTag) {
    if (await isTagExist(audioUrl)) {
      audioUrl = getAttachmentUrlForTag(audioUrl);
      optionalTagName = undefined;
    } else {
      dispatcher.sendMessageAsUser(message.channelId!, `@${username} that tag probably doesnt exist`);
      return;
    }
  }

  const addUrl = async () => {
    try {
      playAudioStore.addUrl(audioUrl);
      if (optionalTagName) await registerTag(optionalTagName, audioUrl);
    } catch (e) {
      dispatcher.sendMessageAsUser(message.channelId!, `@${username} cannot add tag audio: ${e}`);
    }
  };

  (async () => {
    if (username === Constants.SHOW_IMAGE_USER) {
      dispatcher.sendMessageAsUser(message.channelId!, `@${username} ok`);
      addUrl();
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
      dispatcher.sendMessageAsUser(message.channelId!, `@${username} -${Constants.PLAY_AUDIO_COST}`);

      if (message.userInfo.isMod || message.userInfo.isBroadcaster || isTag) {
        addUrl();
      } else {
        const approverObserver = new ApprovableObserver(
          dispatcher,
          message,
          [Constants.PLAY_AUDIO_USER],
          () => addUrl(),
          () => dispatcher.sendMessageAsUser(message.channelId!, `@${username} unfortunate`)
        );
        dispatcher.addObserver(approverObserver);
        karmaStore.updateKarma(Constants.PLAY_AUDIO_KARMA, 'Play Audio');
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
  const args = message.text.replace('  ', ' ').split(' ').slice(1);
  if (args.length < 1) {
    dispatcher.sendMessageAsUser(message.channelId!, `@${username} insufficient arguments`);
    return;
  }

  let amount = 0;

  if (args[0].trim() === 'all') {
    switch (operation) {
      case 'uninvest':
        const returns = GLOBAL_HEART_STOCK_MARKET.uninvestAll(username);
        (await checkCostAddIfEnough(dispatcher, message.channelId!, username, returns))!;
        dispatcher.sendMessageAsUser(
          message.channelId!,
          `@${username} successfully uninvested ${returns} (all)`
        );
        return;
      case 'invest':
        const points = await getPointsForUser(username);
        if (!points) {
          dispatcher.sendMessageAsUser(message.channelId!, `@${username} nothing to invest`);
          return;
        }
        amount = points;
        break;
    }
  } else {
    amount = Number(args[0]);
  }

  if (Number.isNaN(amount) || amount <= 0) {
    dispatcher.sendMessageAsUser(message.channelId!, `@${username} invalid amount`);
    return;
  }

  switch (operation) {
    case 'invest':
      if (!(await checkCostAddIfEnough(dispatcher, message.channelId!, username, -amount, false))) return;
      try {
        GLOBAL_HEART_STOCK_MARKET.invest(message.userInfo.userName, amount);
      } catch (e: unknown) {
        dispatcher.sendMessageAsUser(message.channelId!, `@${username} ${e}`);
        //refund
        (await checkCostAddIfEnough(dispatcher, message.channelId!, username, amount, false))!;
        return
      }
      dispatcher.sendMessageAsUser(
        message.channelId!,
        `@${username} successfully invested ${amount}`
      );
      break;
    case 'uninvest':
      try {
        GLOBAL_HEART_STOCK_MARKET.uninvest(message.userInfo.userName, amount);
      } catch (e: unknown) {
        dispatcher.sendMessageAsUser(message.channelId!, `@${username} ${e}`);
        return;
      }
      (await checkCostAddIfEnough(dispatcher, message.channelId!, username, amount, false))!;
      dispatcher.sendMessageAsUser(
        message.channelId!,
        `@${username} successfully uninvested ${amount}`
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
      (await checkCostAddIfEnough(dispatcher, message.channelId!, user_return.user, user_return.currency, false))!;
    }
    dispatcher.sendMessageAsUser(message.channelId!, `@${message.userInfo.userName} stock market closed!`);
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
      dispatcher.sendMessageAsUser(
        message.channelId!,
        `@${username} unable to do the self-thought, refunding u`
      );

      (await checkCostAddIfEnough(dispatcher, message.channelId!, username, Constants.SELF_THOUGHT_COST))!;
    } else {
      karmaStore.updateKarma(Constants.SELF_THOUGHT_KARMA, 'Self Thought');
      dispatcher.sendMessageAsUser(
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
    const userid = goodnightKissStore.reset();
    dispatcher.sendMessageAsUser(message.channelId!, `@${username} cleared`);
    dispatcher.timeoutUser(message.channelId!, userid, 'Good night! EvilTuckk', 28800);
    return;
  }

  if (goodnightKissStore.isPopulated()) {
    dispatcher.sendMessageAsUser(
      message.channelId!,
      `@${username} goodnightkiss already ongoing`
    );
    return;
  }

  let targetUser = message.userInfo.userName;
  let targetUserId = message.userInfo.userId;

  if (
    message.userInfo.userName === Constants.GOOD_NIGHT_KISS_USER ||
    (await checkCostAddIfEnough(
      dispatcher,
      message.channelId!,
      username,
      -Constants.GOOD_NIGHT_KISS_COST
    ))
  ) {
    goodnightKissStore.setProperties({
      username: targetUser ?? 'no username?',
      userid: targetUserId,
      color: message.userInfo.color ?? 'lightgrey',
      fast_version: Math.random() < 0.1
    });
    karmaStore.updateKarma(Constants.GOOD_NIGHT_KISS_KARMA, 'Good Night Kiss');

    if (message.userInfo.userName === Constants.GOOD_NIGHT_KISS_USER) {
      dispatcher.sendMessageAsUser(message.channelId!, `@${username} ok`);
    } else {
      dispatcher.sendMessageAsUser(
        message.channelId!,
        `@${username} why did u claim this -${Constants.GOOD_NIGHT_KISS_COST}`
      );
    }
  }
}


async function settitleHandler(dispatcher: OverlayDispatchers, message: ChatMessage) {
  const user = message.userInfo;
  if (!message.userInfo.userName) return;
  const username = user.userName;
  if (!username) return;

  if (karmaStore.karma < Constants.SET_TITLE_KARMA_REQUIREMENT) {
    dispatcher.sendMessageAsUser(
      message.channelId!,
      `@${username} chat does not have enough karma for this`
    );
    return;
  }

  const title = message.text.split(' ').slice(1).join(' ');
  if (title.trim().length === 0) return;

  (async () => {
    if (username === Constants.SET_TITLE_USER) {
      dispatcher.rawSendMessageAsUser(message.channelId!, `!settitle ${title}`);
    } else {
      if (
        !(await checkCostAddIfEnough(
          dispatcher,
          message.channelId!,
          username,
          -Constants.SET_TITLE_COST
        ))
      )
        return;

      const approverObserver = new ApprovableObserver(
        dispatcher,
        message,
        [Constants.SET_TITLE_USER],
        () => {
          dispatcher.rawSendMessageAsUser(message.channelId!, `!settitle ${title}`);
          karmaStore.setKarma(
            Constants.SET_TITLE_KARMA_MODIFIER * karmaStore.karma,
            'Set Title karma'
          );
        },
        () => dispatcher.sendMessageAsUser(message.channelId!, `@${username} unfortunate`)
      );
      dispatcher.addObserver(approverObserver);
    }
  })();
}

async function giveKarmaHandler(dispatcher: OverlayDispatchers, message: ChatMessage) {
  const user = message.userInfo;
  if (!message.userInfo.userName) return;
  const username = user.userName;
  if (!username) return;

  if (!user.isBroadcaster && !user.isMod) return;
  const args = message.text.split(' ').slice(1);
  const asNumber = Number.parseFloat(args[0]);
  if (Number.isNaN(asNumber)) return;

  karmaStore.updateKarma(asNumber, 'admin abuse');
  dispatcher.sendMessageAsUser(message.channelId!, `@${username} ok`);
}

async function restartHandler(dispatcher: OverlayDispatchers, message: ChatMessage) {
  const user = message.userInfo;
  if (!message.userInfo.userName) return;
  const username = user.userName;
  if (!username) return;

  if (!user.isBroadcaster) return;

  await closeMarketHandler(dispatcher, message);
  window.location.reload();
}

async function togglesHandler(
  dispatcher: OverlayDispatchers,
  message: ChatMessage,
  blendShape: 'Hearts' | 'Stars' | 'Undress'
) {
  const karmaValue = karmaStore.karma;
  const requiredKarma = Constants.TOGGLES_KARMA.get(blendShape);
  if (!requiredKarma) return;
  if (karmaValue < requiredKarma) {
    dispatcher.sendMessageAsUser(message.channelId!, `@${message.userInfo.userName} forsenLaughingAtYou not enough karma`);
    return;
  }

  let timeoutVal = TOGGLE_EXPIRY.get(blendShape);
  if (timeoutVal) {
    clearTimeout(timeoutVal);
    TOGGLE_EXPIRY.delete(blendShape);
  }

  timeoutVal = setTimeout(() => {
    dispatcher.modelUpdater.setBlendShape(blendShape, 0.0);
  }, TOGGLE_COOLDOWN);

  TOGGLE_EXPIRY.set(blendShape, timeoutVal);
  dispatcher.modelUpdater.setBlendShape(blendShape, 1.0);
  karmaStore.setKarma(karmaValue - requiredKarma, 'Toggles');
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

  callOnlyIfPastCooldown(dispatcher: OverlayDispatchers, callback: () => void) {
    if (new Date().getTime() >= this.nextValid) {
      callback();
      this.nextValid = new Date().getTime() + COOLDOWN;
    } else {
      dispatcher.sendMessageAsUser(PUBLIC_TARGET_CHANNEL_ID, 'command under cooldown');
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
        this.callOnlyIfPastCooldown(dispatcher, () => pollCommandHandler(dispatcher, message));
        break;
      case '%chicken':
      case '%checkin':
        checkInHandler(dispatcher, message, this.busWs);
        break;
      case '%flashbang':
        this.callOnlyIfPastCooldown(dispatcher, () => flashbangHandler(dispatcher, message));
        break;
      case '%blacksilence':
        if (this.busWs) blackSilenceHandler(dispatcher, message, this.busWs);
        else dispatcher.sendMessageAsUser(message.channelId!, `@${message.userInfo.userName} tell vanor he's tupid `);
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
      case '%si':
      case '%showimage':
        showImageHandler(dispatcher, message);
        break;
      case "%pa":
      case '%playsound':
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
        this.callOnlyIfPastCooldown(dispatcher, () => selfThoughtHandler(dispatcher, message));
        break;
      case '%goodnightkiss':
        goodnightkissHandler(dispatcher, message);
        break;
      case '%settitle':
        settitleHandler(dispatcher, message);
        break;
      case '%givekarma':
        giveKarmaHandler(dispatcher, message);
        break;
      case '%restart':
        restartHandler(dispatcher, message);
        break;
      case '%undress':
        this.callOnlyIfPastCooldown(dispatcher, () =>
          togglesHandler(dispatcher, message, 'Undress')
        );
        break;
      case '%stars':
        this.callOnlyIfPastCooldown(dispatcher, () => togglesHandler(dispatcher, message, 'Stars'));
        break;
      case '%hearts':
        this.callOnlyIfPastCooldown(dispatcher, () =>
          togglesHandler(dispatcher, message, 'Hearts')
        );
        break;
    }
    return;
  }
}
