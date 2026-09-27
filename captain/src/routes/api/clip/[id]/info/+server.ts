import { error, json } from '@sveltejs/kit';
import { isValidClipId } from '$lib/clips/parse';
import { resolveOwnedClip } from '$lib/server/clips/clipAccess';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
  const id = params.id;
  if (!id || !isValidClipId(id)) error(400, 'not a valid twitch clip url or id');

  const clip = await resolveOwnedClip(id);
  if (!clip.ok) error(clip.status, clip.message);

  return json({ id, channel: clip.info.channel, title: clip.info.title, author: clip.info.author });
};
