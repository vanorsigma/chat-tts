import type { OverlayDispatchers } from '../../dispatcher';
import type { ChatMessage } from '@twurple/chat';
import { checkCostAddIfEnough, TOGGLE_EXPIRY, TOGGLE_COOLDOWN } from '../middleware';
import { requireUsername } from './shared';
import * as Constants from '../../constants';
import { goodnightKissStore, karmaStore } from '../../stores';
import { ApprovableObserver } from '../../approvable';

export async function goodnightkissHandler(dispatcher: OverlayDispatchers, message: ChatMessage) {
  const username = requireUsername(message);
  if (!username) return;

  const args = message.text.split(' ').slice(1);
  if (args[0] === 'clear' && (message.userInfo.isMod || message.userInfo.isBroadcaster)) {
    const userid = goodnightKissStore.reset();
    dispatcher.sendMessageAsUser(message.channelId!, 'cleared', message.id);
    dispatcher.timeoutUser(
      message.channelId!,
      userid,
      'Good night! EvilTuckk',
      Constants.GOOD_NIGHT_KISS_TIMEOUT_DURATION
    );
    return;
  }

  if (goodnightKissStore.isPopulated()) {
    dispatcher.sendMessageAsUser(message.channelId!, 'goodnightkiss already ongoing', message.id);
    return;
  }

  const targetUserId = message.userInfo.userId;

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
      username: username ?? 'no username?',
      userid: targetUserId,
      color: message.userInfo.color ?? 'lightgrey',
      fast_version: Math.random() < 0.1
    });
    karmaStore.updateKarma(Constants.GOOD_NIGHT_KISS_KARMA, 'Good Night Kiss');

    if (message.userInfo.userName === Constants.GOOD_NIGHT_KISS_USER) {
      dispatcher.sendMessageAsUser(message.channelId!, 'ok', message.id);
    } else {
      dispatcher.sendMessageAsUser(
        message.channelId!,
        `why did u claim this -${Constants.GOOD_NIGHT_KISS_COST}`,
        message.id
      );
    }
  }
}

export async function settitleHandler(dispatcher: OverlayDispatchers, message: ChatMessage) {
  const username = requireUsername(message);
  if (!username) return;

  if (karmaStore.karma < Constants.SET_TITLE_KARMA_REQUIREMENT) {
    dispatcher.sendMessageAsUser(
      message.channelId!,
      'chat does not have enough karma for this',
      message.id
    );
    return;
  }

  const title = message.text.split(' ').slice(1).join(' ');
  if (title.trim().length === 0) return;

  if (username === Constants.SET_TITLE_USER) {
    dispatcher.rawSendMessageAsUser(message.channelId!, `!settitle ${title}`);
    return;
  }

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
    () => dispatcher.sendMessageAsUser(message.channelId!, 'unfortunate', message.id)
  );
  dispatcher.addObserver(approverObserver);
}

export async function togglesHandler(
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
      'forsenLaughingAtYou not enough karma',
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

export async function giveKarmaHandler(dispatcher: OverlayDispatchers, message: ChatMessage) {
  const username = requireUsername(message);
  if (!username) return;

  if (!message.userInfo.isBroadcaster && !message.userInfo.isMod) return;
  const args = message.text.split(' ').slice(1);
  const asNumber = Number.parseFloat(args[0]);
  if (Number.isNaN(asNumber)) return;

  karmaStore.updateKarma(asNumber, 'admin abuse');
  dispatcher.sendMessageAsUser(message.channelId!, 'ok', message.id);
}
