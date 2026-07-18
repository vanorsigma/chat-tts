import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { createPoll } from '$lib/server/twitchPolls';

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();
  const { title, choices, duration } = body;

  if (!title || !choices || !Array.isArray(choices) || choices.length < 2 || choices.length > 5) {
    return json({ error: 'Invalid input: title required, 2-5 choices required' }, { status: 400 });
  }
  if (typeof duration !== 'number' || duration < 15 || duration > 1800) {
    return json({ error: 'Duration must be between 15 and 1800 seconds' }, { status: 400 });
  }
  for (const c of choices) {
    if (typeof c !== 'string' || c.length < 1 || c.length > 25) {
      return json({ error: 'Each choice must be 1-25 characters' }, { status: 400 });
    }
  }

  try {
    const result = await createPoll({ title, choices, duration });
    if (!result) {
      return json({ error: 'Broadcaster API not initialized' }, { status: 503 });
    }
    return json(result);
  } catch (e) {
    console.error('Failed to create poll:', e);
    return json({ error: 'Failed to create poll' }, { status: 500 });
  }
};
