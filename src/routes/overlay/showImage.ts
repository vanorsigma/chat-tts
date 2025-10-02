import type { OverlayDispatchers, OverlayObserver } from './dispatcher';
import type { ChatMessage } from '@twurple/chat';

export const SHOW_IMAGE_COOLDOWN = 60 * 1000;
const AUTHORIZATION_PERIOD = 300 * 1000;

let CURRENT_OBSERVER: ShowImageObserver | null = null;

export class ShowImageObserver implements OverlayObserver {
  private dispatcher: OverlayDispatchers;
  private onAuthorised: () => void;
  private authUsers: string[];

  constructor(
    dispatcher: OverlayDispatchers,
    authorisedUsers: Array<string>,
    onAuthorised: () => void
  ) {
    this.dispatcher = dispatcher;
    this.onAuthorised = onAuthorised;
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
      return;
    }
  }
}
