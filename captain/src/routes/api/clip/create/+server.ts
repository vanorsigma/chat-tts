import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { createClipWithViewer, fetchViewerToken } from '$lib/server/clipstore';
import { getController } from '$lib/server/runtime';
import { getBroadcasterApi } from '$lib/server/twitchAuth';

interface CreateClipBody {
  userId?: unknown;
  title?: unknown;
  duration?: unknown;
}

export const POST: RequestHandler = async ({ request }) => {
  const body = (await request.json().catch(() => null)) as CreateClipBody | null;
  const userId = body?.userId;
  if (typeof userId !== 'string' || !userId) {
    return json({ error: 'userId is required' }, { status: 400 });
  }

  const title =
    typeof body?.title === 'string' && body.title.trim() ? body.title.trim() : undefined;
  const duration =
    typeof body?.duration === 'number' && Number.isFinite(body.duration)
      ? body.duration
      : undefined;

  const config = getController()?.config;
  if (!config) {
    return json({ error: 'Config not loaded' }, { status: 503 });
  }
  const clipStore = config.clipStoreConfig;

  const token = await fetchViewerToken(clipStore, userId);
  if (!token) {
    const authUrl = clipStore.url ? `${clipStore.url}/auth` : undefined;
    return json({ error: 'please link your twitch account first', authUrl }, { status: 401 });
  }

  const broadcast = getBroadcasterApi();
  if (!broadcast) {
    return json({ error: 'Broadcaster API not initialized' }, { status: 503 });
  }

  const result = await createClipWithViewer(token.accessToken, broadcast.userId, {
    title,
    duration
  });
  if (!result.ok) {
    return json({ error: result.message }, { status: result.status });
  }

  return json({
    ok: true,
    id: result.id,
    url: `https://clips.twitch.tv/${result.id}`
  });
};
