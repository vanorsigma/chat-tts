import type { OverlayDispatchers, OverlayObserver } from '../dispatcher';
import {
  asChatCommand,
  COMMAND_HELP,
  COMMAND_SECTION,
  REQUIRES_ARGS,
  type ChatCommand
} from './registry';
import { PUBLIC_TARGET_CHANNEL_ID } from '$env/static/public';
import type { ChatMessage } from '@twurple/chat';
import { getOverlayConfig, isSectionDisabled } from '../constants';
import {
  transferHandler,
  givePointsHandler,
  getPointsHandler,
  checkInHandler
} from './handlers/economy';
import {
  maxwellHandler,
  flashbangHandler,
  blackSilenceHandler,
  mistakeHandler,
  selfThoughtHandler,
  grayscaleHandler
} from './handlers/redeems';
import { mediaHandler } from './handlers/media';
import {
  buyHandler,
  sellHandler,
  stocksHandler,
  buyOrdersHandler,
  sellOrdersHandler,
  endStreamHandler as stockEndStreamHandler
} from './handlers/stockmarket';
import {
  goodnightkissHandler,
  settitleHandler,
  giveKarmaHandler,
  togglesHandler
} from './handlers/interactive';
import { blockHandler, killHandler, restartHandler } from './handlers/moderation';
import { gambaHandler } from './handlers/gamba';
import { pollCommandHandler, endPollCommandHandler } from '../poll.svelte';
import { predictionCommandHandler, endPredictionCommandHandler } from '../prediction.svelte';
import {
  computeSuccessChance,
  getBaseChance,
  rollSuccess,
  timeoutSecondsForFailChance
} from './chance';
import { addBitBoost, flushBitBoosts } from '$lib/api/bits';
import { karmaStore } from '../stores';

const PASS_THROUGH_COMMANDS = new Set(['%bid', '%endbid', '%distract', '%rotate', '%refreshVoice']);

const OVERLAY_HANDLED_COMMANDS = new Set([
  '%poll',
  '%endpoll',
  '%prediction',
  '%endprediction',
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
  '%buy',
  '%sell',
  '%stocks',
  '%buyorders',
  '%sellorders',
  '%endstream',
  '%gamba',
  '%selfthought',
  '%goodnightkiss',
  '%settitle',
  '%givekarma',
  '%restart',
  '%undress',
  '%stars',
  '%hearts',
  '%block',
  '%unblock',
  '%kill',
  '%grayscale'
]);

// Command name → key for commandChances lookup
function chanceKey(commandIndicator: ChatCommand): string {
  const map: Record<string, string> = {
    '%si': 'showimage',
    '%showimage': 'showimage',
    '%pa': 'playaudio',
    '%playsound': 'playaudio',
    '%playaudio': 'playaudio',
    '%chicken': 'checkin',
    '%checkin': 'checkin'
  };
  return map[commandIndicator] ?? commandIndicator.slice(1);
}

export class Commands implements OverlayObserver {
  dispatchers?: OverlayDispatchers = undefined;
  cooldowns: Map<string, number> = new Map();
  gambaUserCooldowns: Map<string, number> = new Map();
  blacklist: Array<ChatCommand> = [];
  bitsBoosts: Map<string, number> = new Map();

  private busWs?: WebSocket = undefined;

  constructor(dispatchers?: OverlayDispatchers) {
    this.dispatchers = dispatchers;
  }

  setBusSocket(ws: WebSocket) {
    if (this.busWs) {
      this.busWs.close();
    }
    this.busWs = ws;
  }

  callOnlyIfPastCooldown(
    commandKey: string,
    dispatcher: OverlayDispatchers,
    message: ChatMessage,
    callback: () => void
  ) {
    const now = Date.now();
    const lastUsed = this.cooldowns.get(commandKey) ?? 0;
    const cooldown =
      (getOverlayConfig().commandCooldowns as Record<string, number | undefined>)[commandKey] ??
      10000;
    if (now >= lastUsed + cooldown) {
      callback();
      this.cooldowns.set(commandKey, now);
    } else {
      dispatcher.sendMessageAsUser(PUBLIC_TARGET_CHANNEL_ID, 'command under cooldown', message.id);
    }
  }

  onMessage(message: ChatMessage): void {
    if (!this.dispatchers) {
      throw new Error('No dispatcher');
    }

    const dispatcher = this.dispatchers;
    const username = message.userInfo.userName;
    if (!username) return;

    if (message.bits > 0 && username) {
      void this.handleBits(message, username);
    }

    const firstSplit = message.text.split(' ')[0];
    if (!firstSplit.startsWith('%')) return;

    const commandIndicator = asChatCommand(firstSplit);
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

    const rest = message.text.slice(firstSplit.length).trim();
    if (REQUIRES_ARGS.has(commandIndicator) && !rest) {
      dispatcher.sendMessageAsUser(
        message.channelId!,
        COMMAND_HELP[commandIndicator] ?? 'invalid syntax',
        message.id
      );
      return;
    }

    const sectionKey = COMMAND_SECTION[commandIndicator];
    if (sectionKey && isSectionDisabled(sectionKey)) {
      dispatcher.sendMessageAsUser(
        message.channelId!,
        `vanor 1984'd ${commandIndicator}, call him stinky!`,
        message.id
      );
      return;
    }

    if (
      OVERLAY_HANDLED_COMMANDS.has(commandIndicator) &&
      !PASS_THROUGH_COMMANDS.has(commandIndicator)
    ) {
      void this.gateCommand(commandIndicator, dispatcher, message, commandIndicator);
      return;
    }

    this.dispatchCommand(commandIndicator, dispatcher, message);
  }

  private async handleBits(message: ChatMessage, username: string) {
    const bits = message.bits;
    karmaStore.updateKarma(bits * 10, 'Bits', false);
    const current = this.bitsBoosts.get(username) ?? 0;
    this.bitsBoosts.set(username, current + bits);
    console.log(`${username} cheered ${bits} bits (total boost: ${current + bits})`);
    await addBitBoost(username, bits);
  }

  getUserBitsBoost(username: string): number {
    return this.bitsBoosts.get(username) ?? 0;
  }

  addUserBitBoost(username: string, bits: number): void {
    const current = this.bitsBoosts.get(username) ?? 0;
    this.bitsBoosts.set(username, current + bits);
  }

  private async gateCommand(
    commandIndicator: ChatCommand,
    dispatcher: OverlayDispatchers,
    message: ChatMessage,
    _commandName: ChatCommand
  ) {
    if (message.userInfo.isBroadcaster) {
      this.dispatchCommand(commandIndicator, dispatcher, message);
      return;
    }

    const bitsBonus = this.getUserBitsBoost(message.userInfo.userName ?? '');
    const ck = chanceKey(commandIndicator);
    const channelId = message.channelId ?? PUBLIC_TARGET_CHANNEL_ID;
    const userId = message.userInfo.userId;

    let chance = 100;
    try {
      const base = getBaseChance(ck);
      chance = await computeSuccessChance(ck, userId, channelId, bitsBonus);
      if (base !== chance) {
        console.log(
          `${message.userInfo.userName} ${commandIndicator}: adjusted chance=${chance}% (base=${base}%, bitsBonus=${bitsBonus}%)`
        );
      }
    } catch (e) {
      console.warn('chance computation failed, defaulting to 100%', e);
    }

    if (rollSuccess(chance)) {
      this.dispatchCommand(commandIndicator, dispatcher, message);
    } else {
      const failChance = 100 - Math.min(chance, 100);
      const timeoutSec = timeoutSecondsForFailChance(failChance);
      dispatcher.sendMessageAsUser(
        channelId,
        `@${message.userInfo.userName} fumbled ${commandIndicator} (${failChance}% fail chance) -> timeout ${timeoutSec}s`,
        message.id
      );
      try {
        await dispatcher.timeoutUser(channelId, userId, 'command failed', timeoutSec);
      } catch (e) {
        console.warn(`failed to timeout ${message.userInfo.userName}:`, e);
      }
    }
  }

  private dispatchCommand(
    commandIndicator: ChatCommand,
    dispatcher: OverlayDispatchers,
    message: ChatMessage
  ) {
    switch (commandIndicator) {
      case '%poll':
        this.callOnlyIfPastCooldown('poll', dispatcher, message, () =>
          pollCommandHandler(dispatcher, message)
        );
        break;
      case '%endpoll':
        endPollCommandHandler(dispatcher, message);
        break;
      case '%prediction':
        this.callOnlyIfPastCooldown('prediction', dispatcher, message, () =>
          predictionCommandHandler(dispatcher, message)
        );
        break;
      case '%endprediction':
        endPredictionCommandHandler(dispatcher, message);
        break;
      case '%chicken':
      case '%checkin':
        checkInHandler(dispatcher, message, this.busWs);
        break;
      case '%flashbang':
        this.callOnlyIfPastCooldown('flashbang', dispatcher, message, () =>
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
        mediaHandler(dispatcher, message, {
          kind: 'image',
          cost: getOverlayConfig().showImage.cost,
          karma: getOverlayConfig().showImage.karma,
          freeUser: getOverlayConfig().showImage.user
        });
        break;
      case '%pa':
      case '%playsound':
      case '%playaudio':
        mediaHandler(dispatcher, message, {
          kind: 'audio',
          cost: getOverlayConfig().playAudio.cost,
          karma: getOverlayConfig().playAudio.karma,
          freeUser: getOverlayConfig().playAudio.user
        });
        break;
      case '%buy':
        buyHandler(dispatcher, message);
        break;
      case '%sell':
        sellHandler(dispatcher, message);
        break;
      case '%stocks':
        stocksHandler(dispatcher, message);
        break;
      case '%buyorders':
        buyOrdersHandler(dispatcher, message);
        break;
      case '%sellorders':
        sellOrdersHandler(dispatcher, message);
        break;
      case '%endstream':
        stockEndStreamHandler(dispatcher, message);
        if (message.userInfo.isBroadcaster) {
          void this.flushBits(dispatcher, message);
        }
        break;
      case '%gamba':
        gambaHandler(this, dispatcher, message);
        break;
      case '%selfthought':
        this.callOnlyIfPastCooldown('selfthought', dispatcher, message, () =>
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
        this.callOnlyIfPastCooldown('undress', dispatcher, message, () =>
          togglesHandler(dispatcher, message, 'Undress')
        );
        break;
      case '%stars':
        this.callOnlyIfPastCooldown('stars', dispatcher, message, () =>
          togglesHandler(dispatcher, message, 'Stars')
        );
        break;
      case '%hearts':
        this.callOnlyIfPastCooldown('hearts', dispatcher, message, () =>
          togglesHandler(dispatcher, message, 'Hearts')
        );
        break;
      case '%block':
        this.callOnlyIfPastCooldown('block', dispatcher, message, () =>
          blockHandler(this, dispatcher, message, 'block')
        );
        break;
      case '%unblock':
        this.callOnlyIfPastCooldown('unblock', dispatcher, message, () =>
          blockHandler(this, dispatcher, message, 'unblock')
        );
        break;
      case '%kill':
        this.callOnlyIfPastCooldown('kill', dispatcher, message, () =>
          killHandler(dispatcher, message)
        );
        break;
      case '%grayscale':
        this.callOnlyIfPastCooldown('grayscale', dispatcher, message, () => {
          if (this.busWs) grayscaleHandler(dispatcher, message, this.busWs);
          else
            dispatcher.sendMessageAsUser(message.channelId!, `tell vanor he's tupid `, message.id);
        });
        break;
      // Pass-through commands (handled elsewhere)
      case '%bid':
      case '%endbid':
      case '%distract':
      case '%rotate':
      case '%refreshVoice':
        break;
    }
  }

  private async flushBits(dispatcher: OverlayDispatchers, message: ChatMessage) {
    try {
      await flushBitBoosts();
    } catch (e) {
      console.warn('Failed to flush bit boosts:', e);
    }
    this.bitsBoosts.clear();
    dispatcher.sendMessageAsUser(
      message.channelId!,
      'all bit boosts flushed for the stream',
      message.id
    );
  }
}
