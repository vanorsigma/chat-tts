import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { getBroadcasterApi } from '$lib/server/twitchAuth';

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();
  const { targetUserId } = body;
  if (!targetUserId || typeof targetUserId !== 'string') {
    return json({ error: 'targetUserId is required' }, { status: 400 });
  }

  const built = getBroadcasterApi();
  if (!built) {
    return json({ error: 'Broadcaster API not initialized' }, { status: 503 });
  }

  try {
    await built.api.asUser(built.userId, (ctx) => ctx.raids.startRaid(built.userId, targetUserId));
    return json({ ok: true });
  } catch (e) {
    console.error(`Failed to start raid to ${targetUserId}:`, e);
    return json({ error: 'Failed to start raid' }, { status: 500 });
  }
};

export const DELETE: RequestHandler = async () => {
  const built = getBroadcasterApi();
  if (!built) {
    return json({ error: 'Broadcaster API not initialized' }, { status: 503 });
  }

  try {
    await built.api.asUser(built.userId, (ctx) => ctx.raids.cancelRaid(built.userId));
    return json({ ok: true });
  } catch (e) {
    console.error('Failed to cancel raid:', e);
    return json({ error: 'Failed to cancel raid' }, { status: 500 });
  }
};
