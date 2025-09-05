import { getPointsForUser, setPointsForUser } from '$lib/server/db';
import { text, type RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ request }) => {
  const searchParam = new URLSearchParams(request.url.split('?')[1]);
  const username = searchParam.get('username')?.trim() ?? '';
  if (!username) {
    return new Response('Bad', {
      status: 400
    });
  }

  return text((await getPointsForUser(username)).toString());
}

export const POST: RequestHandler = async ({ request }) => {
  const searchParam = new URLSearchParams(request.url.split('?')[1]);
  const username = searchParam.get('username')?.trim() ?? '';
  const points = searchParam.get('points')?.trim() ?? '';

  if (!username || !points)
    return new Response('Bad', {
      status: 400
    });

  await setPointsForUser(username, Number(points));
  return new Response('OK', {
    status: 200
  });
}
