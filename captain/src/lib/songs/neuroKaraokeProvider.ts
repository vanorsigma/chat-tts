import type { SongData, SongProvider } from './types';

const RANDOM_URL = 'https://api.neurokaraoke.com/api/songs/random';
const STORAGE_BASE = 'https://storage.neurokaraoke.com';
const IMAGES_BASE = 'https://images.neurokaraoke.com';

interface RawSong {
  id: string;
  title: string;
  coverArtists: string[];
  originalArtists: string[];
  duration: number;
  absolutePath: string;
  coverArt: {
    absolutePath: string;
  } | null;
}

export class NeuroKaraokeSongProvider implements SongProvider {
  readonly id = 'nk';
  readonly label = 'NeuroKaraoke';

  private cache = new Map<string, RawSong>();
  private fetchPromise: Promise<RawSong[]> | null = null;

  private async fetchRawSongs(): Promise<RawSong[]> {
    if (this.fetchPromise) return this.fetchPromise;

    this.fetchPromise = (async () => {
      try {
        const res = await fetch(RANDOM_URL);
        if (!res.ok) {
          console.warn('NeuroKaraokeSongProvider: endpoint returned', res.status);
          return [];
        }
        const songs = (await res.json()) as RawSong[];
        for (const song of songs) {
          this.cache.set(song.id, song);
        }
        return songs;
      } catch (err) {
        console.warn('NeuroKaraokeSongProvider.fetchRawSongs failed:', err);
        return [];
      } finally {
        this.fetchPromise = null;
      }
    })();

    return this.fetchPromise;
  }

  private async ensureCached(rawId: string): Promise<RawSong | null> {
    const cached = this.cache.get(rawId);
    if (cached) return cached;
    await this.fetchRawSongs();
    return this.cache.get(rawId) ?? null;
  }

  private toSongData(raw: RawSong): SongData {
    const prefixedId = `${this.id}-${raw.id}`;
    return {
      id: prefixedId,
      name: raw.title,
      coverArtist: raw.coverArtists?.join(', ') || 'Neuro & Evil',
      actualArtist: raw.originalArtists?.join(', ') || 'Unknown',
      audioUrl: `/api/song/audio/${prefixedId}`,
      coverUrl: `/api/song/cover/${prefixedId}`,
      durationMs: raw.duration * 1000
    };
  }

  async fetchSongs(): Promise<SongData[]> {
    const songs = await this.fetchRawSongs();
    return songs.map((s) => this.toSongData(s));
  }

  async getSong(id: string): Promise<SongData | null> {
    const prefix = `${this.id}-`;
    if (!id.startsWith(prefix)) return null;
    const rawId = id.slice(prefix.length);
    const raw = await this.ensureCached(rawId);
    if (!raw) return null;
    return this.toSongData(raw);
  }

  async getAudioStream(rawId: string): Promise<ReadableStream | null> {
    const raw = await this.ensureCached(rawId);
    if (!raw?.absolutePath) return null;
    try {
      const url = `${STORAGE_BASE}/${raw.absolutePath}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      return res.body;
    } catch (err) {
      console.warn('NeuroKaraokeSongProvider.getAudioStream failed:', err);
      return null;
    }
  }

  async getCoverStream(rawId: string): Promise<ReadableStream | null> {
    const raw = await this.ensureCached(rawId);
    if (!raw?.coverArt?.absolutePath) return null;
    try {
      const path = raw.coverArt.absolutePath.startsWith('/')
        ? raw.coverArt.absolutePath.slice(1)
        : raw.coverArt.absolutePath;
      const url = `${IMAGES_BASE}/${path}/public`;
      const res = await fetch(url);
      if (!res.ok) return null;
      return res.body;
    } catch (err) {
      console.warn('NeuroKaraokeSongProvider.getCoverStream failed:', err);
      return null;
    }
  }
}
