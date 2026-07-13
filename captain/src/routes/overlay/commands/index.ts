import type { OverlayDispatchers, OverlayObserver } from '../dispatcher';
import { asChatCommand, type ChatCommand } from './registry';
import { PUBLIC_TARGET_CHANNEL_ID } from '$env/static/public';
import type { ChatMessage } from '@twurple/chat';
import { getOverlayConfig } from '../constants';
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
  selfThoughtHandler
} from './handlers/redeems';
import { mediaHandler } from './handlers/media';
import { investHandler, stockHandler, closeMarketHandler } from './handlers/stockmarket';
import {
  goodnightkissHandler,
  settitleHandler,
  giveKarmaHandler,
  togglesHandler
} from './handlers/interactive';
import { blockHandler, killHandler, restartHandler } from './handlers/moderation';
import { pollCommandHandler } from '../poll.svelte';

export class Commands implements OverlayObserver {
  dispatchers?: OverlayDispatchers = undefined;
  cooldowns: Map<string, number> = new Map();
  blacklist: Array<ChatCommand> = [];

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

    switch (commandIndicator) {
      case '%poll':
        this.callOnlyIfPastCooldown('poll', dispatcher, message, () =>
          pollCommandHandler(dispatcher, message)
        );
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
      case '%vote':
      case '%bid':
      case '%endbid':
        break;
      case '%distract':
      case '%rotate':
      case '%refreshVoice':
        break;
    }
    return;
  }
}
