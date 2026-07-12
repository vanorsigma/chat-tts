import { getSong } from '$lib/server/db';
import { error, json, type RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async (request) => {
  const songname = request.url.searchParams.get("songname");
  if (!songname) {
    return error(400, 'no songname');
  }
  return json((await getSong(songname)));
}
