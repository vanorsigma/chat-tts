import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { lockPrediction } from '$lib/server/twitchPolls';

export const POST: RequestHandler = async () => {
  try {
    const ok = await lockPrediction();
    if (!ok) {
      return json({ error: 'No active prediction to lock, or API not initialized' }, { status: 400 });
    }
    return json({ ok: true });
  } catch (e) {
    console.error('Failed to lock prediction:', e);
    return json({ error: 'Failed to lock prediction' }, { status: 500 });
  }
};
