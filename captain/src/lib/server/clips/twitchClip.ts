import { existsSync } from 'fs';
import { join } from 'path';
import { createTempDir, removeTempDir } from '$lib/server/tempFiles';
import { getYtdlp } from '$lib/server/ytdlp';

const CLIP_URL_BASE = 'https://clips.twitch.tv/';
export const CLIP_DIR_PREFIX = 'twitchclip-';

export interface TwitchClipInfo {
  channel: string;
  title: string;
  author?: string;
}

export interface DownloadedClip {
  dir: string;
  filePath: string;
}

export function normalizeUploader(value: string): string {
  return value.trim().replace(/^@/, '').toLowerCase();
}

function clipUrl(id: string): string {
  return `${CLIP_URL_BASE}${id}`;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function getClipInfo(id: string): Promise<TwitchClipInfo | null> {
  try {
    const ytdlp = await getYtdlp();
    const info = await ytdlp.getInfoAsync<'video'>(clipUrl(id));
    const channel = info.channel ?? info.uploader;
    if (!channel) return null;
    return { channel, title: info.title ?? '', author: info.uploader };
  } catch (err) {
    console.warn('twitchClip.getClipInfo failed:', errorMessage(err));
    return null;
  }
}

export async function downloadClip(id: string): Promise<DownloadedClip | null> {
  const dir = createTempDir(CLIP_DIR_PREFIX);
  try {
    const ytdlp = await getYtdlp();
    const result = await ytdlp.downloadAsync<'audioandvideo'>(clipUrl(id), {
      format: 'best[ext=mp4]/best',
      output: join(dir, 'clip.%(ext)s')
    });
    const filePath = result.filePaths?.[0];
    if (!filePath || !existsSync(filePath)) {
      removeTempDir(dir);
      return null;
    }
    return { dir, filePath };
  } catch (err) {
    console.warn('twitchClip.downloadClip failed:', errorMessage(err));
    removeTempDir(dir);
    return null;
  }
}
