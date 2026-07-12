import type { OverlayDispatchers, OverlayObserver } from '../dispatcher';
import { asChatCommand, type ChatCommand } from './registry';
import { COOLDOWN } from './middleware';
import { PUBLIC_TARGET_CHANNEL_ID } from '$env/static/public';
import type { ChatMessage } from '@twurple/chat';
import {
  maxwellHandler,
  transferHandler,
  givePointsHandler,
  getPointsHandler,
  checkInHandler,
  flashbangHandler,
  blackSilenceHandler,
  mistakeHandler,
  showImageHandler,
  playAudioHandler,
  investHandler,
  stockHandler,
  closeMarketHandler,
  selfThoughtHandler,
  goodnightkissHandler,
  settitleHandler,
  giveKarmaHandler,
  restartHandler,
  togglesHandler,
  blockHandler,
  killHandler
} from './handlers';
import { pollCommandHandler } from '../poll.svelte';

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
