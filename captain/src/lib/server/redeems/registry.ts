import type { RedeemEntry } from '$lib/config';
import type { EventSubChannelRedemptionAddEvent } from '@twurple/eventsub-base';
import type { ApiClient } from '@twurple/api';
import { getPointsForUser, setPointsForUser } from '../db';
import { getSenderWs } from '../runtime';

export interface RedeemContext {
  event: EventSubChannelRedemptionAddEvent;
  rewardId: string;
  redemptionId: string;
  userLogin: string;
  userId: string;
  userInput: string;
  rewardTitle: string;
  entry: RedeemEntry;
  api: ApiClient;
  broadcasterId: string;
}

export interface RedeemHandler {
  readonly kind: string;
  handle(ctx: RedeemContext): Promise<void>;
}

export interface RedeemHandlerFactory {
  readonly kind: string;
  create(params: RedeemEntry): RedeemHandler;
}

const factories = new Map<string, RedeemHandlerFactory>();

export function registerRedeemHandler(factory: RedeemHandlerFactory) {
  if (factories.has(factory.kind)) {
    console.warn(`Redeem handler '${factory.kind}' already registered, overwriting`);
  }
  factories.set(factory.kind, factory);
}

export function getRedeemHandler(entry: RedeemEntry): RedeemHandler | null {
  const factory = factories.get(entry.kind);
  if (!factory) {
    console.error(`No redeem handler registered for kind '${entry.kind}'`);
    return null;
  }
  return factory.create(entry);
}

const addPointsHandlerFactory: RedeemHandlerFactory = {
  kind: 'addPoints',
  create(_params: RedeemEntry): RedeemHandler {
    return {
      kind: 'addPoints',
      async handle(ctx: RedeemContext) {
        const username = ctx.userLogin.toLowerCase();
        const current = await getPointsForUser(username);
        const newPoints = current + ctx.entry.amount;
        console.log(
          `Redeem: adding ${ctx.entry.amount} points to ${username} (${current} -> ${newPoints})`
        );
        await setPointsForUser(username, newPoints);
      }
    };
  }
};

const addKarmaHandlerFactory: RedeemHandlerFactory = {
  kind: 'addKarma',
  create(_params: RedeemEntry): RedeemHandler {
    return {
      kind: 'addKarma',
      async handle(ctx: RedeemContext) {
        const username = ctx.userLogin;
        const label = `Channel redeem (${ctx.rewardTitle})`;
        console.log(`Redeem: adding ${ctx.entry.amount} karma for ${username}`);
        const ws = getSenderWs();
        if (ws && ws.readyState === ws.OPEN) {
          ws.send(
            JSON.stringify({
              type: 'karma-update',
              amount: ctx.entry.amount,
              label
            })
          );
        } else {
          console.warn('redeem: no sender WS available for karma update');
        }
      }
    };
  }
};

registerRedeemHandler(addPointsHandlerFactory);
registerRedeemHandler(addKarmaHandlerFactory);
