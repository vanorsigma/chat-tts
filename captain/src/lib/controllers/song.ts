export interface SongController {
  playSong(songname: string): Promise<boolean>;
  changeSpeed(speed: number): Promise<void>;
  cancelSong(): void;
}

export class RemoteSongController implements SongController {
  private socket: globalThis.WebSocket;

  constructor(senderUrl: string) {
    this.socket = new WebSocket(senderUrl);
    this.socket.onopen = () => {
      console.log('connected to remote song controller');
    };

    this.socket.onclose = () => {
      console.log('disconnected from remote song controller');
    };
  }

  async playSong(songname: string): Promise<boolean> {
    this.socket.send(JSON.stringify({ type: 'play', songname: songname }));
    return true;
  }

  async changeSpeed(speed: number): Promise<void> {
    this.socket.send(JSON.stringify({ type: 'speed', speed: speed }));
  }

  cancelSong(): void {
    this.socket.send(JSON.stringify({ type: 'cancel' }));
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
