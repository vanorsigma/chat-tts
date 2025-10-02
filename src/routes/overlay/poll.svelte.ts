import type { OverlayDispatchers, OverlayObserver } from './dispatcher';
import { pollStore } from './stores.svelte';
import type { ChatMessage } from '@twurple/chat';

export let GLOBAL_POLL_LOCK = false;

export interface PollOption {
  name: string;
  votes: number;
}

export interface Poll {
  title: string | undefined;
  options: PollOption[] | undefined;
  expiryTime: number | undefined;
}

export class PollObserver implements OverlayObserver {
  /**
   * Poll starts the moment it is created
   */
  private alreadyVoted: Set<string>;
  private poll: Poll;
  private timeout;
  private dispatcher: OverlayDispatchers;

  constructor(dispatcher: OverlayDispatchers, poll: Poll) {
    GLOBAL_POLL_LOCK = true;
    console.log('Poll soon: ', poll);
    this.poll = poll;
    this.alreadyVoted = new Set();
    this.timeout = setTimeout(
      this.timeUp.bind(this),
      (poll.expiryTime ?? 0) - new Date().getTime()
    );
    this.dispatcher = dispatcher;

    pollStore?.set(this.poll);
  }

  onMessage(message: ChatMessage): void {
    if (this.alreadyVoted.has(message.userInfo.userName ?? '')) return;

    const splits = message.text.split(' ');
    switch (splits[0]) {
      case '%endpoll':
        if (message.userInfo.isMod || message.userInfo.isVip || message.userInfo.isBroadcaster) {
          clearTimeout(this.timeout);
          this.timeUp(message.channelId!);
          return;
        }
        break;

      default: {
        const votedFor = Number(message.text.replace('%vote', '').trim());
        if (!this.poll.options) return;
        if (!votedFor || votedFor > this.poll.options.length) return;

        this.poll.options[votedFor - 1].votes += 1;

        pollStore?.set(this.poll);

        this.alreadyVoted.add(message.userInfo.userName ?? '');
        return;
      }
    }
  }

  timeUp(broadcaster_id: string): void {
    if (!this.poll.options || this.poll.options.length === 0) {
      this.dispatcher.removeObserver(this);
      pollStore?.set(null);
      GLOBAL_POLL_LOCK = false;
      return;
    }

    this.dispatcher.removeObserver(this);
    this.dispatcher.sendMessageAsUser(
      broadcaster_id,
      `Poll over! Winner: ${
        this.poll.options.reduce((prev, curr) => {
          if (curr.votes > prev.votes) return curr;
          if (curr.votes === prev.votes)
            return {
              name: `${curr.name} & ${prev.name}`,
              votes: curr.votes
            };
          return prev;
        }).name
      }`
    );
    pollStore?.set(null);
    GLOBAL_POLL_LOCK = false;
  }

  get getPoll(): Poll {
    return this.poll;
  }
}

export function getPollParameters(message: string): Poll {
  const rest = message.replace('%poll', '').trim();
  const splits = rest.split(';');

  return {
    title: splits[0],
    expiryTime: new Date().getTime() + Number(splits[1]) * 1000,
    options: splits.slice(2).map((message) => ({
      name: message,
      votes: 0
    }))
  };
}

export function pollCommandHandler(dispatcher: OverlayDispatchers, message: ChatMessage): void {
  if (GLOBAL_POLL_LOCK) return;
  if (message.userInfo.isMod || message.userInfo.isVip || message.userInfo.isBroadcaster) {
    const observer = new PollObserver(dispatcher, getPollParameters(message.text));
    dispatcher.addObserver(observer);
  }
}
