import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { getBroadcasterApi } from '$lib/server/twitchAuth';

export const GET: RequestHandler = async () => {
  const built = getBroadcasterApi();
  if (!built) return json({ error: 'Broadcaster API not initialized' }, { status: 503 });

  try {
    const [info, stream] = await Promise.all([
      built.api.channels.getChannelInfoById(built.userId),
      built.api.streams.getStreamByUserId(built.userId)
    ]);
    return json({
      category: info?.gameName ?? null,
      streamId: stream?.id ?? null,
      isLive: stream != null
    });
  } catch (e) {
    console.error('Failed to resolve category:', e);
    return json({ error: 'Failed to resolve category' }, { status: 503 });
  }
};
