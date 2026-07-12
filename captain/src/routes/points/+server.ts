import { getPointsForUser, setPointsForUser } from '$lib/server/db';
import { error, text, type RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url }) => {
  const username = url.searchParams.get('username')?.trim() ?? '';
  if (!username) {
    error(400, 'Missing username');
  }

  return text((await getPointsForUser(username)).toString());
}

export const POST: RequestHandler = async ({ url }) => {
  const username = url.searchParams.get('username')?.trim() ?? '';
  const points = url.searchParams.get('points')?.trim() ?? '';

  if (!username || !points) {
    error(400, 'Missing username or points');
  }

  if (!import.meta.env.DEV) {
    await setPointsForUser(username, Number(points));
  }
  return text('OK');
}
