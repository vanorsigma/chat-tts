import { error, type RequestHandler } from '@sveltejs/kit';
import { readFile } from 'fs/promises';
import { lookup } from 'mime-types';
import { getUserFont } from '$lib/server/db';

export const GET: RequestHandler = async ({ url }) => {
  const username = url.searchParams.get('user')?.trim().toLowerCase() ?? '';
  if (!username) {
    console.warn('Font file GET missing user.');
    error(400, 'Missing user');
  }

  const userFont = await getUserFont(username);
  if (!userFont) {
    console.warn(`No font for ${username}.`);
    error(404, 'not found');
  }

  const fileData = Buffer.from(await readFile(`fonts/${userFont.filename}`));
  const contentType = lookup(userFont.filename) || 'application/octet-stream';

  console.log(`Font file GET for ${username}: ${userFont.filename}`);
  return new Response(fileData as BodyInit, {
    headers: {
      'content-type': contentType,
      'content-length': fileData.length.toString()
    }
  });
};
