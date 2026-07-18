import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { createPrediction } from '$lib/server/twitchPolls';

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();
  const { title, outcomes, autoLockAfter } = body;

  if (!title || !outcomes || !Array.isArray(outcomes) || outcomes.length !== 2) {
    return json({ error: 'Invalid input: title required, exactly 2 outcomes required' }, { status: 400 });
  }
  for (const o of outcomes) {
    if (typeof o !== 'string' || o.length < 1 || o.length > 25) {
      return json({ error: 'Each outcome must be 1-25 characters' }, { status: 400 });
    }
  }
  if (typeof autoLockAfter !== 'number' || autoLockAfter < 15 || autoLockAfter > 1800) {
    return json({ error: 'autoLockAfter must be between 15 and 1800 seconds' }, { status: 400 });
  }

  try {
    const result = await createPrediction({ title, outcomes, autoLockAfter });
    if (!result) {
      return json({ error: 'Broadcaster API not initialized' }, { status: 503 });
    }
    return json(result);
  } catch (e) {
    console.error('Failed to create prediction:', e);
    return json({ error: 'Failed to create prediction' }, { status: 500 });
  }
};
