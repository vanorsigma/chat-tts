import type { SongControlMessage } from './messages';
import type { SongData } from './types';

export interface CommandHandlers {
  load: (song: SongData) => void;
  play: () => void;
  pause: () => void;
  skip: (skippedSongId?: string | null, nextSong?: SongData | null) => void;
  seek: (ms: number) => void;
  setRate: (rate: number) => void;
  setVolume: (volume: number) => void;
  loadQueue: (songs: SongData[]) => void;
  removeFromQueue: (songId: string) => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
}

export function handleCommand(msg: SongControlMessage, handlers: CommandHandlers) {
  const cmd = msg.command;
  switch (cmd.type) {
    case 'load':
      handlers.load(cmd.song);
      break;
    case 'play':
      handlers.play();
      break;
    case 'pause':
      handlers.pause();
      break;
    case 'skip':
      handlers.skip(cmd.skippedSongId, cmd.nextSong);
      break;
    case 'seek':
      handlers.seek(cmd.ms);
      break;
    case 'setRate':
      handlers.setRate(cmd.rate);
      break;
    case 'setVolume':
      handlers.setVolume(cmd.volume);
      break;
    case 'loadQueue':
      handlers.loadQueue(cmd.songs);
      break;
    case 'removeFromQueue':
      handlers.removeFromQueue(cmd.songId);
      break;
    case 'reorderQueue':
      handlers.reorderQueue(cmd.fromIndex, cmd.toIndex);
      break;
  }
}
