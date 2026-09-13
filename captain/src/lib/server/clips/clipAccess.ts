import { readChannelName } from '$lib/server/configFile';
import { getClipInfo, normalizeUploader } from './twitchClip';
import type { TwitchClipInfo } from './twitchClip';

export type ClipLookup =
  | { ok: true; info: TwitchClipInfo }
  | { ok: false; status: 403 | 404; message: string };

export async function resolveOwnedClip(id: string): Promise<ClipLookup> {
  const info = await getClipInfo(id);
  if (!info) return { ok: false, status: 404, message: 'couldnt find that clip' };

  const expected = readChannelName();
  if (normalizeUploader(info.channel) !== normalizeUploader(expected)) {
    return {
      ok: false,
      status: 403,
      message: `that clip isnt from ${expected} (is from ${info.channel})`
    };
  }

  return { ok: true, info };
}
