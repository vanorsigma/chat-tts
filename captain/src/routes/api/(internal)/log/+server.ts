/// DO NOT USE THIS ENDPOINT. THE ONLY THING THAT SHOULD BE USING THIS ENDPOINT
/// IS CAPTAIN FOR THE PURPOSES OF ADDING EXTRA LOGS TO THE .log FILE

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { insertLogEntry } from '$lib/server/logger';
import { isLogMessage } from '$lib/bus/messages';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = (await request.json()) as { type: string };
    if (body.type === 'log' && isLogMessage(body)) {
      if (body.source !== 'captain') {
        insertLogEntry(body, false);
      }
    } else {
      console.error('Invalid bus message given to logging endpoint');
    }
  } catch {
    console.error('Invalid JSON given to logging endpoint');
  }

  return json({ ok: true });
};
