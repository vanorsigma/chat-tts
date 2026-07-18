import { json } from '@sveltejs/kit';
import { getSongProviders } from '$lib/server/songs/registry';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  const providers = getSongProviders().map((p) => ({ id: p.id, label: p.label }));
  return json(providers);
};
