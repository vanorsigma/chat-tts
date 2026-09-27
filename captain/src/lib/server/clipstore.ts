import { ApiClient } from '@twurple/api';
import { HttpStatusCodeError } from '@twurple/api-call';
import { createStaticAuthProvider } from './twitchAuth';
import type { ClipStoreConfig } from '$lib/config';

export interface ViewerToken {
  accessToken: string;
  scope: string[];
}

export async function fetchViewerToken(
  config: ClipStoreConfig,
  userId: string
): Promise<ViewerToken | null> {
  if (!config.url || !config.key) return null;
  try {
    const res = await fetch(`${config.url}/token/${encodeURIComponent(userId)}`, {
      headers: { 'x-clip-store-key': config.key }
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { ok: boolean; accessToken: string; scope: string[] };
    if (!data.ok) return null;
    return { accessToken: data.accessToken, scope: data.scope ?? [] };
  } catch {
    return null;
  }
}

export type CreateClipResult =
  | { ok: true; id: string }
  | { ok: false; status: number; message: string };

export interface CreateClipOptions {
  title?: string;
  duration?: number;
}

export async function createClipWithViewer(
  viewerAccessToken: string,
  broadcasterId: string,
  options: CreateClipOptions = {}
): Promise<CreateClipResult> {
  try {
    const api = new ApiClient({
      authProvider: createStaticAuthProvider(viewerAccessToken, ['clips:edit'])
    });
    const id = await api.clips.createClip({
      channel: broadcasterId,
      createAfterDelay: true,
      title: options.title,
      duration: options.duration
    });
    return { ok: true, id };
  } catch (e) {
    if (e instanceof HttpStatusCodeError) {
      return { ok: false, status: e.statusCode, message: `twitch denied clip (${e.statusCode})` };
    }
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, status: 502, message: `failed to create clip: ${message}` };
  }
}
