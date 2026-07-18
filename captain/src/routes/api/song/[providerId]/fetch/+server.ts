import { json } from '@sveltejs/kit';
import { getSongProvider } from '$lib/server/songs/registry';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
  const provider = getSongProvider(params.providerId);
  if (!provider) return new Response('Provider not found', { status: 404 });
  const songs = await provider.fetchSongs();
  return json(songs);
};
