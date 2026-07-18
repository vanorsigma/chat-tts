import { setSubTier, getSubTier } from '$lib/server/db';
import { error, text } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { getBroadcasterApi } from '$lib/server/twitchAuth';

export const GET: RequestHandler = async ({ url }) => {
  const userId = url.searchParams.get('userId')?.trim() ?? '';
  const channelId = url.searchParams.get('channelId')?.trim() ?? '';
  if (!userId) {
    error(400, 'Missing userId');
  }

  const lookupUser = userId;

  let tier = 0;
  try {
    const result = getBroadcasterApi();
    if (result && channelId) {
      const { api, userId: broadcasterId } = result;
      const sub = await api.asUser(broadcasterId, (ctx) =>
        ctx.subscriptions.getSubscriptionForUser(channelId, userId)
      );
      if (sub) {
        tier = Number(sub.tier) / 1000;
      }
    }
  } catch (e) {
    console.warn('Helix sub tier lookup failed, falling back to DB cache:', e);
  }

  if (tier > 0) {
    await setSubTier(lookupUser, tier);
    return text(tier.toString());
  }

  return text((await getSubTier(lookupUser)).toString());
};

export const POST: RequestHandler = async ({ url }) => {
  const username = url.searchParams.get('username')?.trim() ?? '';
  const tier = url.searchParams.get('tier')?.trim() ?? '';
  if (!username || !tier) {
    error(400, 'Missing username or tier');
  }
  await setSubTier(username, Number(tier));
  return text('OK');
};
