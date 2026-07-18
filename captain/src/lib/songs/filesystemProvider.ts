import { readFileSync, existsSync, createReadStream } from 'fs';
import { join } from 'path';
import type { SongData, SongProvider } from './types';

interface SongsJsonEntry {
  id: string;
  name: string;
  coverArtist: string;
  actualArtist: string;
  audioFile: string;
  imgFile: string;
}

const SONGS_DIR = join(process.cwd(), 'songs');
const AUDIO_DIR = join(SONGS_DIR, 'audio');
const IMGS_DIR = join(SONGS_DIR, 'imgs');
const SONGS_JSON_PATH = join(SONGS_DIR, 'songs.json');

function loadSongsJson(): SongsJsonEntry[] {
  if (!existsSync(SONGS_JSON_PATH)) return [];
  try {
    const raw = readFileSync(SONGS_JSON_PATH, 'utf-8');
    return JSON.parse(raw) as SongsJsonEntry[];
  } catch {
    console.warn('Failed to parse songs.json');
    return [];
  }
}

export class FilesystemSongProvider implements SongProvider {
  readonly id = 'fs';
  readonly label = 'Local Filesystem';

  async fetchSongs(): Promise<SongData[]> {
    const entries = loadSongsJson();
    const songs: SongData[] = [];
    for (const entry of entries) {
      const audioPath = join(AUDIO_DIR, entry.audioFile);
      const imgPath = join(IMGS_DIR, entry.imgFile);
      if (!existsSync(audioPath)) continue;
      if (!existsSync(imgPath)) continue;
      const songId = `${this.id}-${entry.id}`;
      songs.push({
        id: songId,
        name: entry.name,
        coverArtist: entry.coverArtist,
        actualArtist: entry.actualArtist,
        audioUrl: `/api/song/audio/${songId}`,
        coverUrl: `/api/song/cover/${songId}`
      });
    }
    return songs;
  }

  async getAudioStream(id: string): Promise<ReadableStream | null> {
    const entries = loadSongsJson();
    const entry = entries.find((e) => e.id === id);
    if (!entry) return null;
    const audioPath = join(AUDIO_DIR, entry.audioFile);
    if (!existsSync(audioPath)) return null;
    const nodeStream = createReadStream(audioPath);
    return new ReadableStream({
      start(controller) {
        nodeStream.on('data', (chunk) => controller.enqueue(chunk));
        nodeStream.on('end', () => controller.close());
        nodeStream.on('error', (err) => controller.error(err));
      },
      cancel() {
        nodeStream.destroy();
      }
    });
  }

  async getSong(id: string): Promise<SongData | null> {
    const prefix = `${this.id}-`;
    if (!id.startsWith(prefix)) return null;
    const rawId = id.slice(prefix.length);
    const entries = loadSongsJson();
    const entry = entries.find((e) => e.id === rawId);
    if (!entry) return null;
    const audioPath = join(AUDIO_DIR, entry.audioFile);
    const imgPath = join(IMGS_DIR, entry.imgFile);
    if (!existsSync(audioPath) || !existsSync(imgPath)) return null;
    return {
      id,
      name: entry.name,
      coverArtist: entry.coverArtist,
      actualArtist: entry.actualArtist,
      audioUrl: `/api/song/audio/${id}`,
      coverUrl: `/api/song/cover/${id}`
    };
  }

  async getCoverStream(id: string): Promise<ReadableStream | null> {
    const entries = loadSongsJson();
    const entry = entries.find((e) => e.id === id);
    if (!entry) return null;
    const imgPath = join(IMGS_DIR, entry.imgFile);
    if (!existsSync(imgPath)) return null;
    const nodeStream = createReadStream(imgPath);
    return new ReadableStream({
      start(controller) {
        nodeStream.on('data', (chunk) => controller.enqueue(chunk));
        nodeStream.on('end', () => controller.close());
        nodeStream.on('error', (err) => controller.error(err));
      },
      cancel() {
        nodeStream.destroy();
      }
    });
  }
}
