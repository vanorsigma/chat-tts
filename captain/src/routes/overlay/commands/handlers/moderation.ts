import type { OverlayDispatchers } from '../../dispatcher';
import type { ChatMessage } from '@twurple/chat';
import type { Commands } from '../index';
import type { Bids } from '../../bid.svelte';
import { checkCostAddIfEnough } from '../middleware';
import { requireUsername } from './shared';
import * as Constants from '../../constants';
import { asChatCommand } from '../registry';
import { makeStandardYesNoBid } from '../../bid.svelte';
import { closeMarketHandler } from './stockmarket';

export async function blockHandler(
  commands: Commands,
  dispatcher: OverlayDispatchers,
  message: ChatMessage,
  action: 'block' | 'unblock'
) {
  const username = requireUsername(message);
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

  const title = `Should we ${action} the command ${commandToBlock}?`;
  const originalChannelId = message.channelId!;
  const originalMessageId = message.id;

  await makeStandardYesNoBid(
    dispatcher,
    title,
    120_000,
    originalChannelId,
    originalMessageId,
    async (bidMessage, bidNumber) => {
      if (
        !(await checkCostAddIfEnough(
          dispatcher,
          message.channelId!,
          bidMessage.userInfo.userName,
          -bidNumber,
          undefined,
          bidMessage.id
        ))
      ) {
        dispatcher.sendMessageAsUser(originalChannelId, 'u r too poor...', bidMessage.id);
        return false;
      }
      return true;
    },
    async (_numbids, _bids) => {
      switch (action) {
        case 'block':
          commands.blacklist.push(commandToBlock);
          break;
        case 'unblock':
          commands.blacklist = commands.blacklist.filter((cmd) => cmd !== commandToBlock);
          break;
      }
      dispatcher.sendMessageAsUser(
        originalChannelId,
        `Bid closed, ${action === 'block' ? 'RIPBOZO' : 'Welcome back'} ${commandToBlock} with ${_numbids} bidded currency`,
        originalMessageId
      );
    },
    async (_numbids, _bids) => {
      dispatcher.sendMessageAsUser(
        originalChannelId,
        `Bid closed, ${commandToBlock} is ${action === 'block' ? 'safe for now...' : 'is still blocked SadCat'}'`,
        originalMessageId
      );
    },
    (_e) => {
      dispatcher.sendMessageAsUser(
        originalChannelId,
        'An error occurred while attempting to do close this bid',
        originalMessageId
      );
    }
  );
}

export async function killHandler(dispatcher: OverlayDispatchers, message: ChatMessage) {
  const username = requireUsername(message);
  if (!username) return;

  const args = message.text.split(' ').slice(1);

  const chatterList = await dispatcher.getChatterList(message.channelId!);
  const chatter = chatterList.find((data) =>
    args[0].toLowerCase().includes(data.userName.toLowerCase())
  );
  if (!chatter) {
    await dispatcher.sendMessageAsUser(
      message.channelId!,
      'The user is not connected to the channel / invalid user',
      message.id
    );
    return;
  }

  const originalMessageChannelId = message.channelId!;
  const originalMessageId = message.id;
  const title = `Should we kill ${chatter.userDisplayName}?`;

  await makeStandardYesNoBid(
    dispatcher,
    title,
    60_000,
    originalMessageChannelId,
    originalMessageId,
    async (biddingMsg, bidNumber) => {
      if (
        !(await checkCostAddIfEnough(
          dispatcher,
          originalMessageChannelId,
          biddingMsg.userInfo.userName,
          -bidNumber,
          undefined,
          biddingMsg.id
        ))
      ) {
        dispatcher.sendMessageAsUser(originalMessageChannelId, 'bro u r too poor', originalMessageId);
        return false;
      }
      return true;
    },
    async (_numbids, _bids) => {
      await dispatcher.timeoutUser(
        originalMessageChannelId,
        chatter.userId,
        'by popular vote, u died, gg no re',
        180
      );
      dispatcher.sendMessageAsUser(
        originalMessageChannelId,
        `Bid closed, ${chatter.userDisplayName} has died.`,
        originalMessageId
      );
    },
    async (_numbids, _bids) => {
      dispatcher.sendMessageAsUser(
        originalMessageChannelId,
        `Bid closed, ${chatter.userDisplayName} is safe for now...`,
        originalMessageId
      );
    },
    (_e) => {
      dispatcher.sendMessageAsUser(
        originalMessageChannelId,
        'Error occurred while trying to finish the bid...',
        originalMessageId
      );
    }
  );
}

export async function restartHandler(dispatcher: OverlayDispatchers, message: ChatMessage) {
  const username = requireUsername(message);
  if (!username) return;

  if (!message.userInfo.isBroadcaster) return;

  await closeMarketHandler(dispatcher, message);
  window.location.reload();
}
