import { getPointsForUser, setPointsForUser } from '$lib/server/db';
import { error, text, type RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url }) => {
  const username = url.searchParams.get('username')?.trim() ?? '';
  if (!username) {
    console.warn('Points GET missing username.');
    error(400, 'Missing username');
  }

  console.log(`Points GET for ${username}`);
  return text((await getPointsForUser(username)).toString());
};

export const POST: RequestHandler = async ({ url }) => {
  const username = url.searchParams.get('username')?.trim() ?? '';
  const points = url.searchParams.get('points')?.trim() ?? '';

  if (!username || !points) {
    console.warn('Points POST missing username or points.');
    error(400, 'Missing username or points');
  }

  console.log(`Points POST for ${username}: ${points}`);
  if (!import.meta.env.DEV) {
    await setPointsForUser(username, Number(points));
  }
  return text('OK');
};
