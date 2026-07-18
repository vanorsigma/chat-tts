import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { loadBotTokenData } from '$lib/server/twitchAuth';

export const GET: RequestHandler = async () => {
  const data = loadBotTokenData();
  if (!data) {
    return json(null, { status: 404 });
  }
  return json({
    accessToken: data.accessToken,
    refreshToken: data.refreshToken ?? null,
    scope: data.scope ?? null,
    expiresIn: data.expiresIn ?? null,
    obtainmentTimestamp: data.obtainmentTimestamp ?? null
  });
};
