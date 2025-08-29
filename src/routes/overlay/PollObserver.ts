import type { ChatUserstate } from "tmi.js";
import type { OverlayObserver } from "./dispatcher";
import type { Poll } from "./poll.svelte";


export class PollObserver implements OverlayObserver {
  private alreadyVoted: Set<string>;
  private poll: Poll;
  private onPollChange: (poll: Poll) => void;

  constructor(poll: Poll, onPollChange: (poll: Poll) => void) {
    this.poll = $state(poll);
    this.alreadyVoted = new Set();
    this.onPollChange = onPollChange;
  }

  onMessage(user: ChatUserstate, message: string): void {
    if (this.alreadyVoted.has(user.username ?? '')) return;

    const splits = message.split(' ');
    if (splits[0] !== '%vote') return;

    const votedFor = Number(message.replace('%vote', '').trim());
    if (votedFor > this.poll.options.length) return;
    this.poll.options[votedFor - 1].votes += 1;
    this.alreadyVoted.add(user.username ?? '');

    this.onPollChange(this.poll);
  }
}
