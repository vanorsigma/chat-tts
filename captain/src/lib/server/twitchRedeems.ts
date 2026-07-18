import { getBroadcasterApi } from '$lib/server/twitchAuth';
import { EventSubWsListener } from '@twurple/eventsub-ws';
import { ApiClient } from '@twurple/api';
import { getController } from './runtime';
import { getRedeemHandler } from './redeems/registry';

let api: ApiClient | null = null;
let broadcasterId: string = '';
let listener: EventSubWsListener | null = null;
let initialized = false;

export async function getCustomRewardsList(): Promise<
  Array<{
    id: string;
    title: string;
    prompt: string;
    cost: number;
    isEnabled: boolean;
    isPaused: boolean;
  }>
> {
  if (!api || !broadcasterId) {
    console.warn('twitchRedeems: broadcaster API not initialized');
    return [];
  }
  const rewards = await api.channelPoints.getCustomRewards(broadcasterId);
  return rewards.map((r) => ({
    id: r.id,
    title: r.title,
    prompt: r.prompt,
    cost: r.cost,
    isEnabled: r.isEnabled,
    isPaused: r.isPaused
  }));
}

async function listRewardsAndLog() {
  try {
    const rewards = await getCustomRewardsList();
    console.log('=== Channel Point Rewards ===');
    for (const r of rewards) {
      console.log(
        `  ${r.id}  |  ${r.title}  |  ${r.cost} pts  |  ${r.isEnabled ? '' : '(paused) '}${r.isPaused ? '(paused) ' : ''}`
      );
    }
    if (rewards.length === 0) console.log('  (none configured)');
    console.log('=============================');
  } catch (e) {
    console.warn('Failed to list channel point rewards:', e);
  }
}

async function handleRedemption(
  event: import('@twurple/eventsub-base').EventSubChannelRedemptionAddEvent
) {
  const config = getController()?.config;
  if (!config) {
    console.warn('Redeem: no controller/config available, ignoring');
    return;
  }

  const rewardId = event.rewardId;
  const redemptionId = event.id;
  const userLogin = event.userName;
  const userId = event.userId;
  const userInput = event.input;
  const rewardTitle = event.rewardTitle;

  const entry = config.redeemConfig.redeems.find((e) => e.id === rewardId);
  if (!entry) {
    console.log(
      `Redeem: reward "${rewardTitle}" (${rewardId}) from ${userLogin} — not configured, ignoring`
    );
    return;
  }

  console.log(
    `Redeem: handling "${rewardTitle}" (${rewardId}) for ${userLogin}, kind=${entry.kind}, amount=${entry.amount}`
  );

  const handler = getRedeemHandler(entry);
  if (!handler) {
    console.error(`Redeem: no handler for kind='${entry.kind}', cancelling redemption`);
    try {
      await event.updateStatus('CANCELED');
    } catch (e) {
      console.error('Redeem: failed to cancel redemption:', e);
    }
    return;
  }

  const ctx = {
    event,
    rewardId,
    redemptionId,
    userLogin,
    userId,
    userInput,
    rewardTitle,
    entry,
    api: api!,
    broadcasterId
  };

  try {
    await handler.handle(ctx);
    console.log(`Redeem: fulfilled ${redemptionId} for ${userLogin}`);
    await event.updateStatus('FULFILLED');
  } catch (e) {
    console.error(`Redeem: handler failed for ${redemptionId}:`, e);
    try {
      await event.updateStatus('CANCELED');
    } catch (e2) {
      console.error('Redeem: failed to cancel redemption after handler error:', e2);
    }
  }
}

export async function initializeTwitchRedeems() {
  if (initialized) return;
  initialized = true;

  const built = getBroadcasterApi();
  if (!built) {
    console.warn(
      'twitchRedeems: No broadcaster token available. Channel point redeems will be unavailable.'
    );
    return;
  }

  api = built.api;
  broadcasterId = built.userId;

  listener = new EventSubWsListener({ apiClient: api });
  listener.start();

  listener.onChannelRedemptionAdd(broadcasterId, handleRedemption);
  console.log(`twitchRedeems: subscribed to redemption events for broadcaster ${broadcasterId}`);

  await listRewardsAndLog();
}
