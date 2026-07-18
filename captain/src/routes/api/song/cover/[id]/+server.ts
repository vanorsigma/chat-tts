import { error } from '@sveltejs/kit';
import { getSongProvider } from '$lib/server/songs/registry';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
  const id = params.id;
  if (!id || /[^a-zA-Z0-9_-]/.test(id)) error(400, 'Invalid id');

  const sep = id.indexOf('-');
  if (sep < 0) error(400, 'Invalid id format');
  const providerId = id.slice(0, sep);
  const rawId = id.slice(sep + 1);

  const provider = getSongProvider(providerId);
  if (!provider) error(404, 'Provider not found');

  const stream = await provider.getCoverStream(rawId);
  if (!stream) error(404, 'Cover image not found');

  return new Response(stream, {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=3600'
    }
  });
};
