import { addBitBoost, getBitBoost, clearBitBoosts } from '$lib/server/db';
import { error, text } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url }) => {
  const username = url.searchParams.get('username')?.trim() ?? '';
  if (!username) {
    error(400, 'Missing username');
  }
  return text((await getBitBoost(username)).toString());
};

export const POST: RequestHandler = async ({ url }) => {
  const username = url.searchParams.get('username')?.trim() ?? '';
  const amountRaw = url.searchParams.get('amount')?.trim() ?? '';
  if (!username || !amountRaw) {
    error(400, 'Missing username or amount');
  }
  const amount = Number(amountRaw);
  if (!Number.isFinite(amount) || amount < 0) {
    error(400, 'Invalid amount');
  }
  await addBitBoost(username, amount);
  return text('OK');
};

export const DELETE: RequestHandler = async () => {
  await clearBitBoosts();
  return text('OK');
};
