export interface SongData {
  id: string;
  name: string;
  coverArtist: string;
  actualArtist: string;
  audioUrl: string;
  coverUrl: string;
  durationMs?: number;
}

export interface SongProvider {
  readonly id: string;
  readonly label: string;
  fetchSongs(): Promise<SongData[]>;
  getSong(id: string): Promise<SongData | null>;
  getAudioStream(id: string): Promise<ReadableStream | null>;
  getCoverStream(id: string): Promise<ReadableStream | null>;
}
