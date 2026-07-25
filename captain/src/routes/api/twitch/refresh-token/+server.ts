import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { refreshTokenNow } from '$lib/server/twitchAuth';

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json().catch(() => ({}));
  const account: string = body.account ?? 'bot';

  if (account !== 'bot' && account !== 'broadcaster') {
    return json(
      { ok: false, error: `Invalid account "${account}". Use "bot" or "broadcaster".` },
      { status: 400 }
    );
  }

  const result = await refreshTokenNow(account);
  if (!result.ok) {
    if (result.error.includes('No token') || result.error.includes('static')) {
      return json(result, { status: 503 });
    }
    return json(result, { status: 500 });
  }
  return json(result);
};
