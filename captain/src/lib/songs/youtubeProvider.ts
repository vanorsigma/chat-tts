import { YtDlp } from 'ytdlp-nodejs';
import { createReadStream } from 'fs';
import { mkdtempSync, rmSync } from 'fs';
import path, { join } from 'path';
import { tmpdir } from 'os';
import type { SongData, SongProvider } from './types';
import fs from 'fs/promises';

export interface YouTubeSongProviderConfig {
  id: string;
  label: string;
  mode: 'playlist' | 'individual';
  playlistUrl?: string;
}

export class YouTubeSongProvider implements SongProvider {
  readonly id: string;
  readonly label: string;
  private mode: 'playlist' | 'individual';
  private playlistUrl?: string;
  private ytdlp?: YtDlp;

  constructor(config: YouTubeSongProviderConfig) {
    this.id = config.id;
    this.label = config.label;
    this.mode = config.mode;
    this.playlistUrl = config.playlistUrl;
  }

  private async getYtdlp(): Promise<YtDlp> {
    const pathEnv = process.env.PATH || '';
    const dirs = pathEnv.split(':');

    const checks = dirs.map(async (dir) => {
      const fullPath = path.join(dir, 'yt-dlp');
      try {
        await fs.access(fullPath, fs.constants.X_OK);
        return fullPath;
      } catch {
        return null;
      }
    });

    const results = (await Promise.all(checks)).filter((p): p is string => p !== null);
    console.log('Found suitable candidates (will pick the first one, may be undefined): ', results);

    if (!this.ytdlp) {
      this.ytdlp = new YtDlp({
        binaryPath: results[0]
      });
    }
    return this.ytdlp;
  }

  private getVideoUrl(videoId: string): string {
    return `https://www.youtube.com/watch?v=${videoId}`;
  }

  private buildSongData(
    videoId: string,
    info: { id: string; title: string; uploader?: string; channel?: string; duration?: number },
    prefixedId: string
  ): SongData {
    const artist = info.uploader ?? info.channel ?? 'YouTube';
    return {
      id: prefixedId,
      name: info.title,
      coverArtist: artist,
      actualArtist: artist,
      audioUrl: `/api/song/audio/${prefixedId}`,
      coverUrl: `/api/song/cover/${prefixedId}`,
      durationMs: info.duration ? info.duration * 1000 : undefined
    };
  }

  async fetchSongs(): Promise<SongData[]> {
    if (this.mode === 'individual') return [];

    if (!this.playlistUrl) {
      console.warn('YouTubeSongProvider: playlist mode but no playlistUrl configured');
      return [];
    }

    try {
      const ytdlp = await this.getYtdlp();
      const info = await ytdlp.getInfoAsync<'playlist'>(this.playlistUrl, {
        flatPlaylist: true
      });
      if (!info.entries?.length) return [];

      return info.entries.map((entry) =>
        this.buildSongData(entry.id, entry, `${this.id}-${entry.id}`)
      );
    } catch (err) {
      console.warn('YouTubeSongProvider.fetchSongs failed:', err);
      return [];
    }
  }

  async getSong(fullId: string): Promise<SongData | null> {
    const prefix = `${this.id}-`;
    if (!fullId.startsWith(prefix)) return null;
    const videoId = fullId.slice(prefix.length);

    try {
      const ytdlp = await this.getYtdlp();
      const info = await ytdlp.getInfoAsync<'video'>(this.getVideoUrl(videoId));
      return this.buildSongData(videoId, info, fullId);
    } catch (err) {
      console.warn('YouTubeSongProvider.getSong failed:', err);
      return null;
    }
  }

  async getAudioStream(videoId: string): Promise<ReadableStream | null> {
    try {
      const ytdlp = await this.getYtdlp();
      const tmpDir = mkdtempSync(join(tmpdir(), 'ytsong-'));
      const result = await ytdlp.downloadAsync<'audioonly'>(this.getVideoUrl(videoId), {
        format: { filter: 'audioonly', quality: 0, type: 'mp3' },
        output: join(tmpDir, 'audio.%(ext)s'),
        cookiesFromBrowser: process.env.YOUTUBE_COOKIES_FROM_BROWSER ?? undefined,
      });

      const filePath = result.filePaths?.[0];
      if (!filePath) {
        rmSync(tmpDir, { recursive: true, force: true });
        return null;
      }

      const nodeStream = createReadStream(filePath);
      let cleanedUp = false;
      const cleanup = () => {
        if (cleanedUp) return;
        cleanedUp = true;
        nodeStream.destroy();
        try {
          rmSync(tmpDir, { recursive: true, force: true });
        } catch {
          /* temp cleanup best-effort */
        }
      };

      return new ReadableStream({
        start(controller) {
          nodeStream.on('data', (chunk) => controller.enqueue(chunk));
          nodeStream.on('end', () => {
            cleanup();
            controller.close();
          });
          nodeStream.on('error', (err) => {
            cleanup();
            controller.error(err);
          });
        },
        cancel() {
          cleanup();
        }
      });
    } catch (err) {
      console.warn('YouTubeSongProvider.getAudioStream failed:', err);
      return null;
    }
  }

  async getCoverStream(videoId: string): Promise<ReadableStream | null> {
    try {
      const ytdlp = await this.getYtdlp();
      const info = await ytdlp.getInfoAsync<'video'>(this.getVideoUrl(videoId));
      const thumbnailUrl = info.thumbnail ?? info.thumbnails?.at?.(-1)?.url;
      if (!thumbnailUrl) return null;

      const response = await fetch(thumbnailUrl);
      if (!response.ok) return null;
      return response.body;
    } catch (err) {
      console.warn('YouTubeSongProvider.getCoverStream failed:', err);
      return null;
    }
  }
}
