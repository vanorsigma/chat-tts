import { deleteUserFont, setUserFont } from '$lib/server/db';
import { error, text, type RequestHandler } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ url }) => {
  const username = url.searchParams.get('user')?.trim().toLowerCase() ?? '';
  if (!username) {
    console.warn('Font POST missing user.');
    error(400, 'Missing user');
  }

  if (url.searchParams.get('reset') === '1') {
    console.log(`Font POST reset for ${username}`);
    await deleteUserFont(username);
    return text('OK');
  }

  const fontname = url.searchParams.get('fontname')?.trim().toLowerCase() ?? '';
  if (!fontname) {
    console.warn('Font POST missing fontname.');
    error(400, 'Missing fontname');
  }

  console.log(`Font POST for ${username}: ${fontname}`);
  await setUserFont(username, fontname);
  return text('OK');
};
