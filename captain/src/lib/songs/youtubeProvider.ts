import { join } from 'path';
import { getYtdlp } from '$lib/server/ytdlp';
import { createTempDir, fileToWebStream, removeTempDir } from '$lib/server/tempFiles';
import type { SongData, SongProvider } from './types';

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

  constructor(config: YouTubeSongProviderConfig) {
    this.id = config.id;
    this.label = config.label;
    this.mode = config.mode;
    this.playlistUrl = config.playlistUrl;
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
      const ytdlp = await getYtdlp();
      const info = await ytdlp.getInfoAsync<'playlist'>(this.playlistUrl, {
        flatPlaylist: true
      });
      if (!info.entries?.length) {
        console.warn('YouTubeSongProvider.fetchSongs: playlist returned no entries');
        return [];
      }

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
      const ytdlp = await getYtdlp();
      const info = await ytdlp.getInfoAsync<'video'>(this.getVideoUrl(videoId));
      return this.buildSongData(videoId, info, fullId);
    } catch (err) {
      console.warn('YouTubeSongProvider.getSong failed:', err);
      return null;
    }
  }

  async getAudioStream(videoId: string): Promise<ReadableStream | null> {
    try {
      const ytdlp = await getYtdlp();
      const tmpDir = createTempDir('ytsong-');
      const result = await ytdlp.downloadAsync<'audioonly'>(this.getVideoUrl(videoId), {
        format: { filter: 'audioonly', quality: 0, type: 'mp3' },
        output: join(tmpDir, 'audio.%(ext)s'),
        cookiesFromBrowser: process.env.YOUTUBE_COOKIES_FROM_BROWSER ?? undefined
      });

      const filePath = result.filePaths?.[0];
      if (!filePath) {
        removeTempDir(tmpDir);
        return null;
      }

      return fileToWebStream(filePath, { onClose: () => removeTempDir(tmpDir) });
    } catch (err) {
      console.warn('YouTubeSongProvider.getAudioStream failed:', err);
      return null;
    }
  }

  async getCoverStream(videoId: string): Promise<ReadableStream | null> {
    try {
      const ytdlp = await getYtdlp();
      const info = await ytdlp.getInfoAsync<'video'>(this.getVideoUrl(videoId));
      const thumbnailUrl = info.thumbnail ?? info.thumbnails?.at?.(-1)?.url;
      if (!thumbnailUrl) {
        console.warn('YouTubeSongProvider.getCoverStream: no thumbnail for', videoId);
        return null;
      }

      const response = await fetch(thumbnailUrl);
      if (!response.ok) {
        console.warn(
          'YouTubeSongProvider.getCoverStream: thumbnail fetch failed',
          response.status,
          thumbnailUrl
        );
        return null;
      }
      return response.body;
    } catch (err) {
      console.warn('YouTubeSongProvider.getCoverStream failed:', err);
      return null;
    }
  }
}
