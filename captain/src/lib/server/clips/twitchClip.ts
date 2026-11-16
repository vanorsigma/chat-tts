import { execFile } from 'child_process';
import { existsSync, rmSync } from 'fs';
import { join } from 'path';
import { promisify } from 'util';
import { createTempDir, removeTempDir } from '$lib/server/tempFiles';
import { getYtdlp } from '$lib/server/ytdlp';

const execFileAsync = promisify(execFile);

const CLIP_URL_BASE = 'https://clips.twitch.tv/';
export const CLIP_DIR_PREFIX = 'twitchclip-';
const FFPROBE_TIMEOUT_MS = 10_000;
const FFMPEG_TIMEOUT_MS = 120_000;

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

// Newer Twitch clips are only served as HEVC, which Chromium/OBS can't decode.
// Re-encode to H.264 so the overlay can actually play them.
async function ensureBrowserPlayable(id: string, dir: string, filePath: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      'ffprobe',
      [
        '-v',
        'error',
        '-select_streams',
        'v:0',
        '-show_entries',
        'stream=codec_name',
        '-of',
        'csv=p=0',
        filePath
      ],
      { timeout: FFPROBE_TIMEOUT_MS }
    );
    const codec = stdout.trim();
    if (!codec || codec === 'h264') return filePath;

    const outPath = join(dir, 'clip.h264.mp4');
    await execFileAsync(
      'ffmpeg',
      [
        '-y',
        '-v',
        'error',
        '-i',
        filePath,
        '-map',
        '0:v:0',
        '-map',
        '0:a?',
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '23',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-b:a',
        '128k',
        '-movflags',
        '+faststart',
        outPath
      ],
      { timeout: FFMPEG_TIMEOUT_MS }
    );
    try {
      rmSync(filePath, { force: true });
    } catch {
      // Keep the transcoded file even if the original cannot be removed.
    }
    return outPath;
  } catch (err) {
    console.warn(
      'twitchClip.downloadClip: transcode failed, serving original:',
      id,
      errorMessage(err)
    );
    return filePath;
  }
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

    return { dir, filePath: await ensureBrowserPlayable(id, dir, filePath) };
  } catch (err) {
    console.warn('twitchClip.downloadClip failed:', errorMessage(err));
    removeTempDir(dir);
    return null;
  }
}
