import type { OverlayDispatchers, OverlayObserver } from './dispatcher';
import type { ChatMessage } from '@twurple/chat';
import * as Constants from './constants';

const AUTHORIZATION_PERIOD = 300 * 1000;

export class ApprovableObserver implements OverlayObserver {
  private dispatcher: OverlayDispatchers;
  private onAuthorised: () => void;
  private onDeny: () => void;
  private authUsers: string[];
  private static idCounter = 1;
  private static currentObservers: ApprovableObserver[] = [];
  public readonly id: number = ApprovableObserver.idCounter++;
  private timeout: NodeJS.Timeout;
  private message: ChatMessage;

  constructor(
    dispatcher: OverlayDispatchers,
    message: ChatMessage,
    authorisedUsers: Array<string>,
    onAuthorised: () => void,
    onDeny: () => void,
  ) {
    this.dispatcher = dispatcher;
    this.onAuthorised = onAuthorised;
    this.onDeny = onDeny;
    this.authUsers = authorisedUsers;
    this.message = message;

    ApprovableObserver.currentObservers.push(this);
    this.timeout = setTimeout(() => {
      this.cleanup();
      this.onDeny()
    }, AUTHORIZATION_PERIOD);

    dispatcher.sendMessageAsUser(
      message.channelId!,
      `${Constants.MODERATOR_USERS.concat(authorisedUsers).map(name => `@${name}`).join(' ')} PLEASE check request by ${message.userInfo.userName} (ID ${this.id})`
    );
  }

  private cleanup() {
    clearTimeout(this.timeout)
    ApprovableObserver.currentObservers = ApprovableObserver.currentObservers.filter(el => el !== this)
    this.dispatcher.removeObserver(this);
  }

  onMessage(message: ChatMessage): void {
    const isAuthorised =
      message.userInfo.isMod ||
      message.userInfo.isBroadcaster ||
      this.authUsers.includes(message.userInfo.userName ?? '');
    if (!isAuthorised) return;

    const args = message.text.replace('  ', ' ').split(' ');
    if (args.length > 2) return;
    const cmd = args[0];
    if (cmd !== 'approve' && cmd !== 'deny') return;

    let id;
    if (args[1] === undefined) {
      if (ApprovableObserver.currentObservers.length === 1) {
        id = ApprovableObserver.currentObservers[0].id;
      } else if (this.id === Math.min(...ApprovableObserver.currentObservers.map(o => o.id))) {
        this.dispatcher.sendMessageAsUser(message.channelId!, `@${message.userInfo.userName} specify an ID (one of ${ApprovableObserver.currentObservers.map(o => o.id).join(',')})`);
        return;
      } else { return }
    } else {
      id = Number(args[1]);
      if (isNaN(id)) return;

    }

    if (id === this.id) {
      if (cmd === 'approve') {
        this.cleanup();
        this.onAuthorised();
      }
      else if (cmd === 'deny') {
        this.cleanup();
        this.onDeny();
      }
    }
  }
}
