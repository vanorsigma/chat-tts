import { Synth } from 'beepbox';

export interface SongController {
  playSong(songname: string): Promise<boolean>;
  changeSpeed(speed: number): Promise<void>;
  cancelSong(): void;
}

export class RemoteSongController implements SongController {
  private socket: WebSocket;

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
  private masterSynth?: Synth;
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
      this.masterSynth.song!.tempo = (this.expectedTempo ?? 150) * speed;
    }
  }

  cancelSong() {
    if (this.masterSynth) {
      this.masterSynth.pause();
    }
  }

  async playSong(songname: string): Promise<boolean> {
    if (this.songsPlaying.includes(songname)) {
      return false;
    }

    try {
      if ((await this.getSongs()).includes(songname)) {
        if (this.masterSynth) {
          this.masterSynth.pause();
        }

        const song = await this.getSong(songname);
        const synth = new Synth(song);
        this.masterSynth = synth;
        this.expectedTempo = synth.song!.tempo;
        synth.song!.loopLength = 0;
        synth.loopRepeatCount = 0;

        const oldPause = synth.pause.bind(synth);
        this.songsPlaying.push(songname);

        synth.pause = () => {
          this.songsPlaying = this.songsPlaying.filter((s) => s !== songname);
          this.masterSynth = undefined;
          oldPause();
        };
        synth.volume = 0.6;
        synth.play();
        return true;
      }
    } catch (e) {
      console.error('Problem with playing beepbox song: ', e);
      return false;
    }
    return false;
  }
}
