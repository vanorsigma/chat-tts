import type { ChatUserstate } from 'tmi.js';
import type { OverlayDispatchers, OverlayObserver } from './dispatcher';

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

  onMessage(user: ChatUserstate, message: string): void {
    const isAuthorised =
      user.badges?.moderator ||
      user.badges?.broadcaster ||
      this.authUsers.includes(user?.username ?? '');

    if (!isAuthorised) return;
    if (message === 'approve') {
      this.dispatcher.removeObserver(this);
      this.onAuthorised();
      return;
    }

    if (message === 'deny') {
      this.dispatcher.removeObserver(this);
      return;
    }
  }
}
