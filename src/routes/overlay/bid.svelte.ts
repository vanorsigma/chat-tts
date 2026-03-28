import type { ChatMessage } from '@twurple/chat';
import type { OverlayDispatchers, OverlayObserver } from './dispatcher';
import { biddingStore } from './stores.svelte';

export interface BidOptions {
  // Title of the bid
  title: string;

  // Duration to hold the bid for
  duration: number;

  // Options to start with
  startingOptions: Array<string>;

  /**
  The predicate that processes the chat message from %bid.
   */
  predicate: (arg: ChatMessage) => Promise<[string, number] | null>;

  /**
  Callback when the bid completes.
   */
  bidCompleteCallback:
    | ((bidOption: string | null, numBids: number | null, bids: Map<string, number>) => void)
    | undefined;
}

export interface BidInstance {
  options: BidOptions;
  bids: Map<string, number>;
  elapsed: number;
}

export let GLOBAL_BID_LOCK = false;
export const ELAPSED_GRANULARITY = 1000; // decreasing this may cause lag

export class BidObserver implements OverlayObserver {
  private timeout: NodeJS.Timeout;
  private progress: NodeJS.Timeout;
  private bidInstance: BidInstance;

  protected constructor(dispatcher: OverlayDispatchers, options: BidOptions) {
    GLOBAL_BID_LOCK = true;
    this.timeout = setTimeout(() => {
      if (this.bidInstance?.bids) {
        const [winningBidOption, numBids] = this.bidInstance?.bids
          .entries()
          .reduce((prev, curr) => (curr[1] > prev[1] ? curr : prev));

        // tie check
        biddingStore.clear();
        GLOBAL_BID_LOCK = false;
        if ([...this.bidInstance?.bids.values().filter((v) => v === numBids)].length > 1) {
          options.bidCompleteCallback?.call(this, null, null, this.bidInstance.bids);
        } else {
          options.bidCompleteCallback?.call(this, winningBidOption, numBids, this.bidInstance.bids);
        }
      }

      clearTimeout(this.timeout);
      clearInterval(this.progress);
      dispatcher.removeObserver(this);
    }, options.duration);

    this.progress = setInterval(() => {
      this.bidInstance.elapsed += ELAPSED_GRANULARITY;
      biddingStore.set(this.bidInstance);
    }, ELAPSED_GRANULARITY);

    this.bidInstance = {
      options,
      bids: new Map(options.startingOptions.map((option) => [option, 0.0])),
      elapsed: 0
    } as BidInstance;
  }

  public static create(dispatcher: OverlayDispatchers, options: BidOptions): BidObserver | null {
    if (GLOBAL_BID_LOCK) return null;
    return new BidObserver(dispatcher, options);
  }

  async rawAddBit(option: string, value: number): Promise<void> {
    const totalBidNumber = this.bidInstance.bids.get(option) ?? 0.0;
    this.bidInstance.bids.set(option, totalBidNumber + value);
    biddingStore.set(this.bidInstance);
  }

  async onMessage(message: ChatMessage): Promise<void> {
    const splits = message.text.split(' ');
    if (splits[0] !== '%bid') return;

    const userDefinedPredicate = this.bidInstance.options.predicate;

    const predicateResult = await userDefinedPredicate(message);
    if (!predicateResult) return;
    const [bidOption, bidNumber] = predicateResult;
    await this.rawAddBit(bidOption, bidNumber);
  }
}
