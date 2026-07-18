import { json } from '@sveltejs/kit';
import { getSongProvider } from '$lib/server/songs/registry';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  const provider = getSongProvider('fs');
  if (!provider) return json([]);
  const songs = await provider.fetchSongs();
  return json(songs);
};
