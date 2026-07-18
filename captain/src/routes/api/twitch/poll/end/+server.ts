import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { endPoll } from '$lib/server/twitchPolls';

export const POST: RequestHandler = async () => {
  try {
    const ok = await endPoll();
    if (!ok) {
      return json({ error: 'No active poll to end, or API not initialized' }, { status: 400 });
    }
    return json({ ok: true });
  } catch (e) {
    console.error('Failed to end poll:', e);
    return json({ error: 'Failed to end poll' }, { status: 500 });
  }
};
