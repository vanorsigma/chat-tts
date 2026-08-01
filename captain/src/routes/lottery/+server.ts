import {
  getLotteryEntries,
  addLotteryEntry,
  getLotteryTax,
  addLotteryTax,
  clearLottery
} from '$lib/server/db';
import { error, json, text, type RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async () => {
  const [entries, tax] = await Promise.all([getLotteryEntries(), getLotteryTax()]);
  return json({ entries, tax });
};

export const POST: RequestHandler = async ({ url }) => {
  const action = url.searchParams.get('action')?.trim() ?? '';

  if (action === 'add') {
    const username = url.searchParams.get('username')?.trim() ?? '';
    const shares = url.searchParams.get('shares')?.trim() ?? '';
    if (!username || !shares) {
      console.warn('Lottery POST add missing username or shares.');
      error(400, 'Missing username or shares');
    }
    await addLotteryEntry(username, Number(shares));
    return text('OK');
  }

  if (action === 'addtax') {
    const amount = url.searchParams.get('amount')?.trim() ?? '';
    if (!amount) {
      console.warn('Lottery POST addtax missing amount.');
      error(400, 'Missing amount');
    }
    await addLotteryTax(Number(amount));
    return text('OK');
  }

  if (action === 'clear') {
    await clearLottery();
    return text('OK');
  }

  console.warn('Lottery POST missing or unknown action.');
  error(400, 'Missing or unknown action');
};
