import type { ChatMessage } from '@twurple/chat';
import { OverlayDispatchers, type OverlayObserver } from './dispatcher';
import { biddingStore } from './stores.svelte';

export type Bids = Map<string, number>;

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
  bids: Bids;
  elapsed: number;
}

export let GLOBAL_BID_LOCK = false;
export const ELAPSED_GRANULARITY = 1000; // decreasing this may cause lag

export class BidObserver implements OverlayObserver {
  private timeout: NodeJS.Timeout;
  private progress: NodeJS.Timeout;
  private bidInstance: BidInstance;
  private options: BidOptions;
  private dispatcher: OverlayDispatchers;

  protected constructor(dispatcher: OverlayDispatchers, options: BidOptions) {
    GLOBAL_BID_LOCK = true;
    this.options = options;
    this.dispatcher = dispatcher;
    this.timeout = setTimeout(() => this.clearBid(), options.duration);

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

  public clearBid() {
    if (this.bidInstance?.bids) {
      const [winningBidOption, numBids] = this.bidInstance?.bids
        .entries()
        .reduce((prev, curr) => (curr[1] > prev[1] ? curr : prev));

      // tie check
      biddingStore.clear();
      GLOBAL_BID_LOCK = false;
      if ([...this.bidInstance?.bids.values().filter((v) => v === numBids)].length > 1) {
        this.options.bidCompleteCallback?.call(this, null, null, this.bidInstance.bids);
      } else {
        this.options.bidCompleteCallback?.call(
          this,
          winningBidOption,
          numBids,
          this.bidInstance.bids
        );
      }
    }

    clearTimeout(this.timeout);
    clearInterval(this.progress);
    this.dispatcher.removeObserver(this);
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
    if (splits[0] === '%endbid' && (message.userInfo.isMod || message.userInfo.isBroadcaster)) {
      this.clearBid();
      return;
    }
    if (splits[0] !== '%bid') return;

    const userDefinedPredicate = this.bidInstance.options.predicate;

    const predicateResult = await userDefinedPredicate(message);
    if (!predicateResult) return;
    const [bidOption, bidNumber] = predicateResult;
    await this.rawAddBit(bidOption, bidNumber);
  }
}

export async function makeStandardYesNoBid(
  dispatcher: OverlayDispatchers,
  title: string,
  duration: number,
  channelId: string,
  msgId: string,
  processBidCost: (bidMessage: ChatMessage, bidNumber: number) => Promise<boolean>,
  onYesWin: (numbids: number, bids: Bids) => Promise<void>,
  onNoWin: (numbids: number, bids: Bids) => Promise<void>,
  onError: (e: unknown) => void = () => {}
): Promise<BidObserver | null> {
  const observer = BidObserver.create(dispatcher, {
    title,
    duration,
    startingOptions: ['yes', 'no'],
    predicate: async (msg) => {
      const biddingUser = msg.userInfo;
      if (!biddingUser.userName) return null;
      const args = msg.text.split(' ').slice(1);
      if (args.length < 2) {
        dispatcher.sendMessageAsUser(msg.channelId!, 'Not enough arguments', msg.id);
        return null;
      }

      const option = args.slice(1).join(' ').toLowerCase();
      if (option && option != 'yes' && option != 'no') {
        dispatcher.sendMessageAsUser(msg.channelId!, 'Invalid option', msg.id);
        return null;
      }

      let bidNumber = Number.parseFloat(args[0]);
      if (Number.isNaN(bidNumber)) {
        dispatcher.sendMessageAsUser(msg.channelId!, 'Not a valid number', msg.id);
        return null;
      }

      if (bidNumber < 0) {
        dispatcher.sendMessageAsUser(msg.channelId!, 'No negative arguments', msg.id);
        return null;
      }

      if (!(await processBidCost(msg, bidNumber))) {
        dispatcher.sendMessageAsUser(msg.channelId!, 'bro u r too poor', msg.id);
        return null;
      }

      dispatcher.sendMessageAsUser(msg.channelId!, 'ok', msg.id);
      return [option, bidNumber];
    },
    bidCompleteCallback: async (option, numbids, bids) => {
      switch (option) {
        case 'yes':
          try {
            await onYesWin(numbids ?? 0, bids);
          } catch (e) {
            onError(e);
          }
          break;
        case null:
        case 'no':
          try {
            await onNoWin(numbids ?? 0, bids);
          } catch (e) {
            onError(e);
          }
          break;
      }
    }
  });

  if (observer) {
    dispatcher.addObserver(observer);
    dispatcher.sendMessageAsUser(channelId, `Bid started, "${title}"`, msgId);
  } else {
    dispatcher.sendMessageAsUser(
      channelId,
      `There is currently an existing bid, will not proceed`,
      msgId
    );
  }
  return observer;
}
