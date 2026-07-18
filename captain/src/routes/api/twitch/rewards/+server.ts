import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { getCustomRewardsList } from '$lib/server/twitchRedeems';

export const GET: RequestHandler = async () => {
  try {
    const rewards = await getCustomRewardsList();
    return json(rewards);
  } catch (e) {
    console.error('Failed to fetch rewards:', e);
    return json({ error: 'Broadcaster API not initialized' }, { status: 503 });
  }
};
