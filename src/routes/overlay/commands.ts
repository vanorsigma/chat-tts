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
import { getAttachmentUrlForTag, isTagExist, registerTag } from './attachmentsInterface';
import { BidObserver } from './bid.svelte';
import { walk } from 'svelte/compiler';

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
  use_stock_market: boolean = true,
  message_id: string | undefined = undefined,
  check_only: boolean = false
): Promise<boolean> {
  const currentTask = _checkCostAddIfEnoughLock
    .then(async () => {
      const points = (await getPointsForUser(username)) ?? 0;

      if (points + difference >= 0) {
        if (check_only) return true;
        await setPointsForUser(username, points + difference);
        return true;
      } else if (check_only) return false;

      if (use_stock_market) {
        try {
          GLOBAL_HEART_STOCK_MARKET.uninvest(username, -difference);
          return true;
        } catch (e: unknown) {}
      }

      //TODO: this should probably be the caller's responsibiility
      dispatcher.sendMessageAsUser(broadcaster_id, `you can't afford this PoorVanor`, message_id);
      return false;
    })
    .catch((err) => {
      console.error(err);
      return false;
    });
  _checkCostAddIfEnoughLock = currentTask;
  return await currentTask;
}

async function maxwellHandler(dispatcher: OverlayDispatchers, message: ChatMessage) {
  const user = message.userInfo;
  if (!user.userName) return;

  const username = user.userName;

  (async () => {
    if (username === Constants.MAXWELL_USER) {
      dispatcher.sendMessageAsUser(message.channelId!, `ok`, message.id);
    } else {
      if (
        !(await checkCostAddIfEnough(
          dispatcher,
          message.channelId!,
          username,
          -Constants.MAXWELL_COST,
          undefined,
          message.id
        ))
      )
        return;
      dispatcher.sendMessageAsUser(message.channelId!, `-${Constants.MAXWELL_COST}`, message.id);
    }

    maxwellStore.increment();
  })();
}

async function transferHandler(dispatcher: OverlayDispatchers, message: ChatMessage) {
  const args = message.text.split(' ').slice(1);
  if (args.length < 2) {
    dispatcher.sendMessageAsUser(message.channelId!, `insufficient arguments`, message.id);
    return;
  }
  const target = args[0].toLowerCase();
  const amount = Number(args[1]);

  if (!message.userInfo.userName) return;

  const username = message.userInfo.userName;
  if (target === username) {
    dispatcher.sendMessageAsUser(message.channelId!, `cant transfer to yourself`, message.id);
    return;
  }

  if (Number.isNaN(amount) || amount <= 0) {
    dispatcher.sendMessageAsUser(message.channelId!, `invalid amount`, message.id);
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

async function givePointsHandler(dispatcher: OverlayDispatchers, message: ChatMessage) {
  if (!message.userInfo.userName) return;
  if (!message.userInfo.isBroadcaster) return;

  const splitted = message.text.split(' ');
  const target = splitted[1];
  const points = Number(splitted[2]);
  if (Number.isNaN(points)) return;

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

function getPointsHandler(dispatcher: OverlayDispatchers, message: ChatMessage) {
  if (!message.userInfo.userName) return;

  const username = message.userInfo.userName;
  const target = message.text.split(' ').at(1) ?? username;

  // immediate async execution
  (async () => {
    const points = (await getPointsForUser(target)) ?? 0;
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
    dispatcher.sendMessageAsUser(message.channelId!, `you've already checked in RAGEY`, message.id);
    return;
  }

  dispatcher.sendMessageAsUser(
    message.channelId!,
    `vedalWave @${user.userName} here's +${Constants.CHECK_IN_POINTS} meow`,
    message.id
  );
  PEOPLE_WHO_CHECKED_IN.push(user.userName);

  (await checkCostAddIfEnough(
    dispatcher,
    message.channelId!,
    username,
    Constants.CHECK_IN_POINTS,
    undefined,
    message.id
  ))!;
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
        -Constants.FLASHBANG_COST,
        undefined,
        message.id
      )
    ) {
      flashbangStore.increment();
      karmaStore.updateKarma(Constants.FLASHBANG_KARMA, 'Flashbang');
      dispatcher.sendMessageAsUser(
        message.channelId!,
        `throwing a flashbang, -${Constants.FLASHBANG_COST}`,
        message.id
      );
    }
  } else {
    dispatcher.sendMessageAsUser(message.channelId!, `NO xdHAH`, message.id);
  }
}

function blackSilenceHandler(dispatcher: OverlayDispatchers, message: ChatMessage, ws: WebSocket) {
  const user = message.userInfo;
  if (!user.userName) return;

  const username = user.userName;

  (async () => {
    if (username === Constants.BLACK_SILENCE_USER) {
      dispatcher.sendMessageAsUser(message.channelId!, `ok`, message.id);
    } else {
      if (
        !(await checkCostAddIfEnough(
          dispatcher,
          message.channelId!,
          username,
          -Constants.BLACK_SILENCE_COST,
          undefined,
          message.id
        ))
      )
        return;
      dispatcher.sendMessageAsUser(
        message.channelId!,
        `-${Constants.BLACK_SILENCE_COST}`,
        message.id
      );
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
      dispatcher.sendMessageAsUser(message.channelId!, `ok but i hate u btw`, message.id);
    } else {
      if (
        !(await checkCostAddIfEnough(
          dispatcher,
          message.channelId!,
          username,
          -Constants.MISTAKE_COST,
          undefined,
          message.id
        ))
      )
        return;
      dispatcher.sendMessageAsUser(message.channelId!, `-${Constants.MISTAKE_COST}`, message.id);
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
    dispatcher.sendMessageAsUser(message.channelId!, `insufficient arguments`, message.id);
    return;
  }

  let imageUrl = args[0];
  let optionalTagName = args.at(1);
  let isTag = !imageUrl.startsWith('http');
  // backwards compatibility with {tag} syntax
  if (isTag && imageUrl.startsWith('{') && imageUrl.endsWith('}')) {
    imageUrl = imageUrl.slice(1, -1);
  }

  if (isTag) {
    if (await isTagExist(imageUrl)) {
      imageUrl = getAttachmentUrlForTag(imageUrl);
      optionalTagName = undefined;
    } else {
      dispatcher.sendMessageAsUser(
        message.channelId!,
        `that tag probably doesnt exist`,
        message.id
      );
      return;
    }
  }

  const addUrl = async () => {
    showImageStore.addUrl(imageUrl);
    try {
      if (optionalTagName) await registerTag(optionalTagName, imageUrl);
    } catch (e) {
      dispatcher.sendMessageAsUser(message.channelId!, `cannot add tag image: ${e}`, message.id);
    }
  };

  (async () => {
    if (username === Constants.SHOW_IMAGE_USER) {
      dispatcher.sendMessageAsUser(message.channelId!, `ok`, message.id);
      addUrl();
    } else {
      if (
        !(await checkCostAddIfEnough(
          dispatcher,
          message.channelId!,
          username,
          -Constants.SHOW_IMAGE_COST,
          undefined,
          message.id
        ))
      )
        return;
      dispatcher.sendMessageAsUser(message.channelId!, `-${Constants.SHOW_IMAGE_COST}`, message.id);

      if (message.userInfo.isMod || message.userInfo.isBroadcaster || isTag) {
        addUrl();
      } else {
        const approverObserver = new ApprovableObserver(
          dispatcher,
          message,
          [Constants.SHOW_IMAGE_USER],
          () => addUrl(),
          () =>
            dispatcher.sendMessageAsUser(
              message.channelId!,
              `lbozo try better next time`,
              message.id
            )
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
    dispatcher.sendMessageAsUser(message.channelId!, `insufficient arguments`, message.id);
    return;
  }

  let audioUrl = args[0];
  let optionalTagName = args.at(1);
  let isTag = !audioUrl.startsWith('http');
  // backwards compatibility with {tag} syntax
  if (isTag && audioUrl.startsWith('{') && audioUrl.endsWith('}')) {
    audioUrl = audioUrl.slice(1, -1);
  }

  if (isTag) {
    if (await isTagExist(audioUrl)) {
      audioUrl = getAttachmentUrlForTag(audioUrl);
      optionalTagName = undefined;
    } else {
      dispatcher.sendMessageAsUser(
        message.channelId!,
        `that tag probably doesnt exist`,
        message.id
      );
      return;
    }
  }

  const addUrl = async () => {
    try {
      playAudioStore.addUrl(audioUrl);
      if (optionalTagName) await registerTag(optionalTagName, audioUrl);
    } catch (e) {
      dispatcher.sendMessageAsUser(message.channelId!, `cannot add tag audio: ${e}`, message.id);
    }
  };

  (async () => {
    if (username === Constants.SHOW_IMAGE_USER) {
      dispatcher.sendMessageAsUser(message.channelId!, `ok`, message.id);
      addUrl();
    } else {
      if (
        !(await checkCostAddIfEnough(
          dispatcher,
          message.channelId!,
          username,
          -Constants.PLAY_AUDIO_COST,
          undefined,
          message.id
        ))
      )
        return;
      dispatcher.sendMessageAsUser(message.channelId!, `-${Constants.PLAY_AUDIO_COST}`, message.id);

      if (message.userInfo.isMod || message.userInfo.isBroadcaster || isTag) {
        addUrl();
      } else {
        const approverObserver = new ApprovableObserver(
          dispatcher,
          message,
          [Constants.PLAY_AUDIO_USER],
          () => addUrl(),
          () => dispatcher.sendMessageAsUser(message.channelId!, `unfortunate`, message.id)
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
    dispatcher.sendMessageAsUser(message.channelId!, `insufficient arguments`, message.id);
    return;
  }

  let amount = 0;

  if (args[0].trim() === 'all') {
    switch (operation) {
      case 'uninvest':
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
      case 'invest':
        const points = await getPointsForUser(username);
        if (!points) {
          dispatcher.sendMessageAsUser(message.channelId!, `nothing to invest`, message.id);
          return;
        }
        amount = points;
        break;
    }
  } else {
    amount = Number(args[0]);
  }

  if (Number.isNaN(amount) || amount <= 0) {
    dispatcher.sendMessageAsUser(message.channelId!, `invalid amount`, message.id);
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
        //refund
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

async function stockHandler(dispatcher: OverlayDispatchers, message: ChatMessage) {
  if (!message.userInfo.userName) return;

  const username = message.userInfo.userName;
  const stock_value = GLOBAL_HEART_STOCK_MARKET.get_current_price_for(username);

  dispatcher.sendMessageAsUser(
    message.channelId!,
    `${username} has ${stock_value} in the heart rate stock market`,
    message.id
  );
}

async function closeMarketHandler(dispatcher: OverlayDispatchers, message: ChatMessage) {
  if (!message.userInfo.userName) return;

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
    dispatcher.sendMessageAsUser(message.channelId!, `stock market closed!`, message.id);
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
      -Constants.SELF_THOUGHT_COST,
      undefined,
      message.id
    )
  ) {
    const msg = encodeURIComponent(text);
    const response = await fetch(`${PUBLIC_SELF_THOUGHT_URL}/processMessage?message=${msg}`);
    if (response.status !== 200) {
      dispatcher.sendMessageAsUser(
        message.channelId!,
        `unable to do the self-thought, refunding u`,
        message.id
      );

      (await checkCostAddIfEnough(
        dispatcher,
        message.channelId!,
        username,
        Constants.SELF_THOUGHT_COST,
        undefined,
        message.id
      ))!;
    } else {
      karmaStore.updateKarma(Constants.SELF_THOUGHT_KARMA, 'Self Thought');
      dispatcher.sendMessageAsUser(
        message.channelId!,
        `-${Constants.SELF_THOUGHT_COST}`,
        message.id
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
    dispatcher.sendMessageAsUser(message.channelId!, `cleared`, message.id);
    dispatcher.timeoutUser(message.channelId!, userid, 'Good night! EvilTuckk', 28800);
    return;
  }

  if (goodnightKissStore.isPopulated()) {
    dispatcher.sendMessageAsUser(message.channelId!, `goodnightkiss already ongoing`, message.id);
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
      -Constants.GOOD_NIGHT_KISS_COST,
      undefined,
      message.id
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
      dispatcher.sendMessageAsUser(message.channelId!, `ok`, message.id);
    } else {
      dispatcher.sendMessageAsUser(
        message.channelId!,
        `why did u claim this -${Constants.GOOD_NIGHT_KISS_COST}`,
        message.id
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
      `chat does not have enough karma for this`,
      message.id
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
          -Constants.SET_TITLE_COST,
          undefined,
          message.id
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
        () => dispatcher.sendMessageAsUser(message.channelId!, `unfortunate`, message.id)
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
  dispatcher.sendMessageAsUser(message.channelId!, `ok`, message.id);
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
    dispatcher.sendMessageAsUser(
      message.channelId!,
      `forsenLaughingAtYou not enough karma`,
      message.id
    );
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

async function blockHandler(
  commands: Commands,
  dispatcher: OverlayDispatchers,
  message: ChatMessage,
  action: 'block' | 'unblock'
) {
  const user = message.userInfo;
  if (!message.userInfo.userName) return;
  const username = user.userName;
  if (!username) return;
  const args = message.text.split(' ').slice(1);
  const commandToBlock = asChatCommand(args[0]);

  if (!commandToBlock) {
    dispatcher.sendMessageAsUser(
      message.channelId!,
      `Invalid command to block: ${commandToBlock}`,
      message.id
    );
    return;
  }

  if (commands.blacklist.includes(commandToBlock) && action === 'block') {
    dispatcher.sendMessageAsUser(
      message.channelId!,
      `${commandToBlock} is already blocked!`,
      message.id
    );
    return;
  }

  if (!commands.blacklist.includes(commandToBlock) && action === 'unblock') {
    dispatcher.sendMessageAsUser(
      message.channelId!,
      `${commandToBlock} is already unblocked!`,
      message.id
    );
    return;
  }

  if (Constants.UNBLOCKABLE_COMMANDS.includes(commandToBlock)) {
    dispatcher.sendMessageAsUser(
      message.channelId!,
      `Cannot perform this action on ${commandToBlock}`,
      message.id
    );
    return;
  }

  if (
    !(await checkCostAddIfEnough(
      dispatcher,
      message.channelId!,
      username,
      -Constants.BLOCK_MINIMUM_BID,
      undefined,
      message.id,
      true
    ))
  ) {
    dispatcher.sendMessageAsUser(
      message.channelId!,
      `You will need a minimum of ${Constants.BLOCK_MINIMUM_BID} as a minimum bid for this command`,
      message.id
    );
    return;
  }

  const title = `Should we ${action} the command ${commandToBlock}?`;
  const observer = BidObserver.create(dispatcher, {
    title,
    duration: 120_000,
    startingOptions: ['yes', 'no'],
    predicate: async (msg) => {
      const biddingUser = msg.userInfo;
      if (!biddingUser.userName) return null;

      const args = msg.text.split(' ').slice(1);
      if (args.length < 2) {
        dispatcher.sendMessageAsUser(message.channelId!, 'Not enough arguments', msg.id);
        return null;
      }

      const option = args.slice(1).join(' ').toLowerCase();
      if (option && option != 'yes' && option != 'no') {
        dispatcher.sendMessageAsUser(message.channelId!, 'Invalid option', msg.id);
        return null;
      }

      let bidNumber = Number.parseFloat(args[0]);
      if (Number.isNaN(bidNumber)) {
        dispatcher.sendMessageAsUser(message.channelId!, 'Not a valid number', msg.id);
        return null;
      }
      if (bidNumber < 0) {
        dispatcher.sendMessageAsUser(message.channelId!, 'No negative arguments', msg.id);
        return null;
      }

      if (
        !(await checkCostAddIfEnough(
          dispatcher,
          message.channelId!,
          biddingUser.userName,
          -bidNumber,
          undefined,
          message.id
        ))
      )
        return null;

      dispatcher.sendMessageAsUser(message.channelId!, 'ok', msg.id);
      return [option, bidNumber];
    },
    bidCompleteCallback: (option, numbids, _bids) => {
      switch (option) {
        case 'yes':
          switch (action) {
            case 'block':
              commands.blacklist.push(commandToBlock);
              break;
            case 'unblock':
              commands.blacklist = commands.blacklist.filter((cmd) => cmd !== commandToBlock);
              break;
          }
          dispatcher.sendMessageAsUser(
            message.channelId!,
            `Bid closed, ${action === 'block' ? 'RIPBOZO' : 'Welcome back'} ${commandToBlock} with ${numbids} bidded currency`,
            message.id
          );
          break;
        case 'no':
        case null:
          dispatcher.sendMessageAsUser(
            message.channelId!,
            `Bid closed, ${commandToBlock} is ${action === 'block' ? 'safe for now...' : 'is still blocked SadCat'}'`,
            message.id
          );
          break;
      }
    }
  });

  if (observer) {
    dispatcher.addObserver(observer);
    dispatcher.sendMessageAsUser(message.channelId!, `Bid started, "${title}"`, message.id);
  } else
    dispatcher.sendMessageAsUser(
      message.channelId!,
      'There is currently an existing bid, will not proceed',
      message.id
    );
}

async function killHandler(dispatcher: OverlayDispatchers, message: ChatMessage) {
  const user = message.userInfo;
  if (!message.userInfo.userName) return;
  const username = user.userName;
  if (!username) return;
  const args = message.text.split(' ').slice(1);

  const chatterList = await dispatcher.getChatterList(message.channelId!);
  const chatter = chatterList.find((data) =>
    args[0].toLowerCase().includes(data.userName.toLowerCase())
  );
  if (!chatter) {
    await dispatcher.sendMessageAsUser(
      message.channelId!,
      `The user is not connected to the channel / invalid user`,
      message.id
    );
    return;
  }

  const title = `Should we kill ${chatter.userDisplayName}?`;
  const observer = BidObserver.create(dispatcher, {
    title,
    duration: 120_000,
    startingOptions: ['yes', 'no'],
    predicate: async (msg) => {
      const biddingUser = msg.userInfo;
      if (!biddingUser.userName) return null;
      const args = msg.text.split(' ').slice(1);
      if (args.length < 2) {
        dispatcher.sendMessageAsUser(message.channelId!, 'Not enough arguments', msg.id);
        return null;
      }

      const option = args.slice(1).join(' ').toLowerCase();
      if (option && option != 'yes' && option != 'no') {
        dispatcher.sendMessageAsUser(message.channelId!, 'Invalid option', msg.id);
        return null;
      }

      let bidNumber = Number.parseFloat(args[0]);
      if (Number.isNaN(bidNumber)) {
        dispatcher.sendMessageAsUser(message.channelId!, 'Not a valid number', msg.id);
        return null;
      }

      if (bidNumber < 0) {
        dispatcher.sendMessageAsUser(message.channelId!, 'No negative arguments', msg.id);
        return null;
      }

      if (
        !(await checkCostAddIfEnough(
          dispatcher,
          message.channelId!,
          biddingUser.userName,
          -bidNumber,
          undefined,
          message.id
        ))
      ) {
        dispatcher.sendMessageAsUser(message.channelId!, 'bro u r too poor', msg.id);
        return null;
      }

      dispatcher.sendMessageAsUser(message.channelId!, 'ok', msg.id);
      return [option, bidNumber];
    },
    bidCompleteCallback: async (option, numbids, _bids) => {
      switch (option) {
        case 'yes':
          try {
            await dispatcher.timeoutUser(
              message.channelId!,
              chatter.userId,
              'by popular vote, u died, gg no re',
              180
            );
            dispatcher.sendMessageAsUser(
              message.channelId!,
              `Bid closed, ${chatter.userDisplayName} has died.`,
              message.id
            );
          } catch (e) {
            await dispatcher.sendMessageAsUser(
              message.channelId!,
              `Can't do that, unfortunately.`,
              message.id
            );
          }
          break;
        case 'no':
          dispatcher.sendMessageAsUser(
            message.channelId!,
            `Bid closed, ${chatter.userDisplayName} is safe for now...`,
            message.id
          );
          break;
      }
    }
  });

  if (observer) {
    dispatcher.addObserver(observer);
    dispatcher.sendMessageAsUser(message.channelId!, `Bid started, "${title}"`, message.id);
  } else {
    dispatcher.sendMessageAsUser(
      message.channelId!,
      `There is currently an existing bid, will not proceed`,
      message.id
    );
  }
}

const ALL_COMMANDS = [
  '%poll',
  '%vote',
  '%chicken',
  '%checkin',
  '%flashbang',
  '%blacksilence',
  '%points',
  '%givepoints',
  '%transfer',
  '%maxwell',
  '%mistake',
  '%si',
  '%showimage',
  '%pa',
  '%playsound',
  '%playaudio',
  '%invest',
  '%uninvest',
  '%stock',
  '%closemarket',
  '%selfthought',
  '%goodnightkiss',
  '%settitle',
  '%givekarma',
  '%restart',
  '%undress',
  '%stars',
  '%hearts',
  '%bid',
  '%block',
  '%unblock',
  '%kill',
  '%rotate',
  '%distract',
  '%endbid'
] as const;

type ChatCommand = (typeof ALL_COMMANDS)[number];

function isChatCommand(rawStr: string): rawStr is ChatCommand {
  return (ALL_COMMANDS as readonly string[]).includes(rawStr);
}

function asChatCommand(rawStr: string): ChatCommand | null {
  if (isChatCommand(rawStr)) return rawStr;
  if (isChatCommand(`%${rawStr}`)) return `%${rawStr}` as ChatCommand;
  return null;
}

export class Commands implements OverlayObserver {
  dispatchers?: OverlayDispatchers = undefined;
  nextValid: number = new Date().getTime();
  blacklist: Array<ChatCommand> = [];

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

  callOnlyIfPastCooldown(
    dispatcher: OverlayDispatchers,
    message: ChatMessage,
    callback: () => void,
    cooldown: number = COOLDOWN
  ) {
    if (new Date().getTime() >= this.nextValid) {
      callback();
      this.nextValid = new Date().getTime() + cooldown;
    } else {
      dispatcher.sendMessageAsUser(PUBLIC_TARGET_CHANNEL_ID, 'command under cooldown', message.id);
    }
  }

  onMessage(message: ChatMessage): void {
    if (!this.dispatchers) {
      throw new Error('No dispatcher');
    }

    const dispatcher = this.dispatchers;
    const firstSplit = message.text.split(' ')[0];
    if (!firstSplit.startsWith('%')) return;

    let commandIndicator = asChatCommand(firstSplit);
    if (!commandIndicator) {
      dispatcher.sendMessageAsUser(message.channelId!, 'Not a valid command.', message.id);
      return;
    }

    if (this.blacklist.includes(commandIndicator)) {
      dispatcher.sendMessageAsUser(
        message.channelId!,
        'This command has been blocked!',
        message.id
      );
      return;
    }

    switch (commandIndicator) {
      case '%poll':
        this.callOnlyIfPastCooldown(dispatcher, message, () =>
          pollCommandHandler(dispatcher, message)
        );
        break;
      case '%chicken':
      case '%checkin':
        checkInHandler(dispatcher, message, this.busWs);
        break;
      case '%flashbang':
        this.callOnlyIfPastCooldown(dispatcher, message, () =>
          flashbangHandler(dispatcher, message)
        );
        break;
      case '%blacksilence':
        if (this.busWs) blackSilenceHandler(dispatcher, message, this.busWs);
        else dispatcher.sendMessageAsUser(message.channelId!, `tell vanor he's tupid `, message.id);
        break;
      case '%points':
        getPointsHandler(dispatcher, message);
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
      case '%pa':
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
        this.callOnlyIfPastCooldown(dispatcher, message, () =>
          selfThoughtHandler(dispatcher, message)
        );
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
        this.callOnlyIfPastCooldown(
          dispatcher,
          message,
          () => togglesHandler(dispatcher, message, 'Undress'),
          1000
        );
        break;
      case '%stars':
        this.callOnlyIfPastCooldown(
          dispatcher,
          message,
          () => togglesHandler(dispatcher, message, 'Stars'),
          1000
        );
        break;
      case '%hearts':
        this.callOnlyIfPastCooldown(
          dispatcher,
          message,
          () => togglesHandler(dispatcher, message, 'Hearts'),
          1000
        );
        break;
      case '%block':
        this.callOnlyIfPastCooldown(dispatcher, message, () =>
          blockHandler(this, dispatcher, message, 'block')
        );
        break;
      case '%unblock':
        this.callOnlyIfPastCooldown(dispatcher, message, () =>
          blockHandler(this, dispatcher, message, 'unblock')
        );
        break;
      case '%kill':
        this.callOnlyIfPastCooldown(dispatcher, message, () => killHandler(dispatcher, message));
        break;
      case '%vote':
      case '%bid':
      case '%distract':
      case '%rotate':
      case '%endbid':
        // We recognize these as valid commands, but they are handled elsewhere
        break;
    }
    return;
  }
}
