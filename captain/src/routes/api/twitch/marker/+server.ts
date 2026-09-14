import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { getBroadcasterApi } from '$lib/server/twitchAuth';

export const POST: RequestHandler = async ({ request }) => {
  const body = (await request.json().catch(() => null)) as { description?: unknown } | null;
  const description = body?.description;
  if (typeof description !== 'string' || !description.trim()) {
    return json({ error: 'description is required' }, { status: 400 });
  }

  const built = getBroadcasterApi();
  if (!built) {
    return json({ error: 'Broadcaster API not initialized' }, { status: 503 });
  }

  try {
    const marker = await built.api.streams.createStreamMarker(built.userId, description);
    return json({ ok: true, id: marker.id });
  } catch (e) {
    console.error('Failed to create stream marker:', e);
    return json({ error: 'Failed to create marker' }, { status: 500 });
  }
};
