import type { OverlayDispatchers, OverlayObserver } from './dispatcher';
import type { ChatMessage } from '@twurple/chat';

const AUTHORIZATION_PERIOD = 300 * 1000;

/// NOTE: At any one point of time, there can only be one approvable observer
let CURRENT_OBSERVER: ApprovableObserver | null = null;

export class ApprovableObserver implements OverlayObserver {
  private dispatcher: OverlayDispatchers;
  private onAuthorised: () => void;
  private onDeny: () => void;
  private authUsers: string[];

  constructor(
    dispatcher: OverlayDispatchers,
    authorisedUsers: Array<string>,
    onAuthorised: () => void,
    onDeny: () => void,
  ) {
    this.dispatcher = dispatcher;
    this.onAuthorised = onAuthorised;
    this.onDeny = onDeny;
    this.authUsers = authorisedUsers;

    if (CURRENT_OBSERVER) {
      this.dispatcher.removeObserver(CURRENT_OBSERVER);
    }
    CURRENT_OBSERVER = this;
    setTimeout(() => {
      this.dispatcher.removeObserver(this);
    }, AUTHORIZATION_PERIOD);
  }

  onMessage(message: ChatMessage): void {
    const isAuthorised =
      message.userInfo.isMod ||
      message.userInfo.isBroadcaster ||
      this.authUsers.includes(message.userInfo.userName ?? '');

    if (!isAuthorised) return;
    if (message.text === 'approve') {
      this.dispatcher.removeObserver(this);
      this.onAuthorised();
      return;
    }

    if (message.text === 'deny') {
      this.dispatcher.removeObserver(this);
      this.onDeny();
      return;
    }
  }
}
