import { getSong } from '$lib/server/db';
import { error, json, type RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async (request) => {
  const songname = request.url.searchParams.get('songname');
  if (!songname) {
    console.warn('Song GET missing songname.');
    return error(400, 'no songname');
  }
  console.log(`Song GET for ${songname}`);
  return json(await getSong(songname));
};
