import { error, json } from '@sveltejs/kit';
import { getSongProviders } from '$lib/server/songs/registry';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
  const id = params.id;
  if (!id || /[^a-zA-Z0-9_-]/.test(id)) error(400, 'Invalid id');

  const providers = getSongProviders();
  for (const provider of providers) {
    const song = await provider.getSong(id);
    if (song) {
      return json(song);
    }
  }
  error(404, 'Song not found');
};
