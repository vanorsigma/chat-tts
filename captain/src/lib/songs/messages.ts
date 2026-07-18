import type { SongData } from './types';

export interface SongControlMessage {
  type: 'song-control';
  command:
    | { type: 'play'; songId?: string }
    | { type: 'pause' }
    | { type: 'skip'; skippedSongId?: string | null; nextSong?: SongData | null }
    | { type: 'seek'; ms: number }
    | { type: 'setRate'; rate: number }
    | { type: 'load'; song: SongData }
    | { type: 'loadQueue'; songs: SongData[] }
    | { type: 'removeFromQueue'; songId: string }
    | { type: 'reorderQueue'; fromIndex: number; toIndex: number }
    | { type: 'setVolume'; volume: number };
}

export interface SongStateMessage {
  type: 'song-state';
  songId: string | null;
  positionMs: number;
  durationMs: number;
  rate: number;
  playing: boolean;
  queueHead: string | null;
  song?: SongData | null;
}

export interface SpamCompleteMessage {
  type: 'spam-complete';
  songId: string;
  elapsedMs: number;
}

export interface SongCompleteMessage {
  type: 'song-complete';
  songId: string;
  elapsedMs: number;
}

export function isSongControlMessage(obj: unknown): obj is SongControlMessage {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    (obj as Record<string, unknown>).type === 'song-control'
  );
}

export function isSongStateMessage(obj: unknown): obj is SongStateMessage {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    (obj as Record<string, unknown>).type === 'song-state'
  );
}

export function isSpamCompleteMessage(obj: unknown): obj is SpamCompleteMessage {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    (obj as Record<string, unknown>).type === 'spam-complete'
  );
}

export function isSongCompleteMessage(obj: unknown): obj is SongCompleteMessage {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    (obj as Record<string, unknown>).type === 'song-complete'
  );
}
