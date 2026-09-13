import { error } from '@sveltejs/kit';
import { lookup } from 'mime-types';
import { isValidClipId } from '$lib/clips/parse';
import { resolveOwnedClip } from '$lib/server/clips/clipAccess';
import { acquireClipFile, releaseClipFile } from '$lib/server/clips/clipFiles';
import { fileToWebStream } from '$lib/server/tempFiles';
import type { RequestHandler } from './$types';

interface ByteRange {
  start: number;
  end: number;
  partial: boolean;
}

function parseRangeHeader(header: string | null, size: number): ByteRange | null {
  const full: ByteRange = { start: 0, end: size - 1, partial: false };
  if (!header) return full;

  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return full;

  const [, startText, endText] = match;
  if (!startText && !endText) return null;

  if (!startText) {
    const suffixLength = Number(endText);
    if (suffixLength <= 0) return null;
    return { start: Math.max(0, size - suffixLength), end: size - 1, partial: true };
  }

  const start = Number(startText);
  if (start >= size) return null;

  const end = endText ? Math.min(Number(endText), size - 1) : size - 1;
  if (start > end) return null;
  return { start, end, partial: true };
}

export const GET: RequestHandler = async ({ params, request }) => {
  const id = params.id;
  if (!id || !isValidClipId(id)) error(400, 'not a valid twitch clip url or id');

  const clip = await resolveOwnedClip(id);
  if (!clip.ok) error(clip.status, clip.message);

  const file = await acquireClipFile(id);
  if (!file) error(500, 'failed to download that clip');

  const range = parseRangeHeader(request.headers.get('range'), file.size);
  if (!range) error(416, 'range not satisfiable');

  const headers: Record<string, string> = {
    'Content-Type': lookup(file.filePath) || 'video/mp4',
    'Content-Length': String(range.end - range.start + 1),
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-store'
  };
  if (range.partial) headers['Content-Range'] = `bytes ${range.start}-${range.end}/${file.size}`;

  return new Response(fileToWebStream(file.filePath, { start: range.start, end: range.end }), {
    status: range.partial ? 206 : 200,
    headers
  });
};

export const DELETE: RequestHandler = async ({ params }) => {
  const id = params.id;
  if (!id || !isValidClipId(id)) error(400, 'not a valid twitch clip url or id');

  releaseClipFile(id);
  return new Response(null, { status: 204 });
};
