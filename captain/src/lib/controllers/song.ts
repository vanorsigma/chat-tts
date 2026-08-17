import WebSocket from 'ws';

export interface SongController {
  playSong(songname: string): Promise<boolean>;
  changeSpeed(speed: number): Promise<void>;
  cancelSong(): void;
}

export class RemoteSongController implements SongController {
  private getSocket: () => WebSocket | null;

  constructor(getSocket: () => WebSocket | null) {
    this.getSocket = getSocket;
    console.log('Remote song controller created.');
  }

  private send(payload: unknown) {
    const socket = this.getSocket();
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      console.error('Cannot send song command: bus socket is not connected');
      return;
    }
    socket.send(JSON.stringify(payload));
  }

  async playSong(songname: string): Promise<boolean> {
    console.log(`Playing song: ${songname}`);
    this.send({ type: 'play', songname: songname });
    return true;
  }

  async changeSpeed(speed: number): Promise<void> {
    console.log(`Song speed changed to: ${speed}`);
    this.send({ type: 'speed', speed: speed });
  }

  cancelSong(): void {
    console.log('Cancelling song.');
    this.send({ type: 'cancel' });
  }
}

export class LocalSongController implements SongController {
  private songsPlaying: string[] = [];
  private masterSynth?: unknown;
  private expectedTempo?: number;

  async getSongs(): Promise<string[]> {
    const response = await fetch('/songs');
    if (response.status !== 200) {
      throw new Error('cannot fetch from songs endpoint');
    }

    return await response.json();
  }

  async getSong(songname: string): Promise<string> {
    const response = await fetch(`/song?songname=${songname}`);
    if (response.status !== 200) {
      throw new Error('cannot fetch from songs endpoint');
    }

    return (await response.json())['base64'];
  }

  async changeSpeed(speed: number) {
    if (this.masterSynth) {
      console.log(`song speed speed changed to: ${speed}`);
      (this.masterSynth as { song?: { tempo: number } }).song!.tempo =
        (this.expectedTempo ?? 150) * speed;
    }
  }

  cancelSong() {
    if (this.masterSynth) {
      (this.masterSynth as { pause: () => void }).pause();
    }
  }

  async playSong(songname: string): Promise<boolean> {
    if (this.songsPlaying.includes(songname)) {
      return false;
    }

    try {
      if ((await this.getSongs()).includes(songname)) {
        if (this.masterSynth) {
          (this.masterSynth as { pause: () => void }).pause();
        }

        const { Synth } = await import('beepbox');
        const song = await this.getSong(songname);
        const synth = new Synth(song);
        this.masterSynth = synth;
        this.expectedTempo = (synth as { song?: { tempo: number } }).song!.tempo;
        (synth as { song?: { loopLength: number } }).song!.loopLength = 0;
        (synth as { loopRepeatCount: number }).loopRepeatCount = 0;

        const oldPause = (synth as { pause: () => void }).pause.bind(synth);
        this.songsPlaying.push(songname);

        (synth as { pause: () => void }).pause = () => {
          this.songsPlaying = this.songsPlaying.filter((s) => s !== songname);
          this.masterSynth = undefined;
          oldPause();
        };
        (synth as { volume: number }).volume = 0.6;
        (synth as { play: () => void }).play();
        return true;
      }
    } catch (e) {
      console.error('Problem with playing beepbox song: ', e);
      return false;
    }
    return false;
  }
}
