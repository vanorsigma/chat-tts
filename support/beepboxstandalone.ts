// Browserless beepbox
import process from "node:process";
import { StreamAudioContext as AudioContext } from '@descript/web-audio-js';
import { Synth } from 'beepbox/esm/synth/synth';
import Speaker from 'speaker';
import WebSocket from 'ws';

const baseUrl = 'http://localhost:4173'
const wsUrl = 'ws://localhost:3001/receivers';

let offlineContext = new AudioContext();
const speaker = new Speaker({
  channels: offlineContext.numberOfChannels,
  bitDepth: offlineContext.format['bitDepth'],
  sampleRate: offlineContext.sampleRate
});
offlineContext.pipe(speaker);

// This exception occurs whenever playback is complete. To fix this,
// I'd have to fork @descript/web-audio-js, but if this also works,
// then screw it clueless
process.on('uncaughtException', (err, _origin) => {
  if (err instanceof TypeError) {
    console.log('TypeError hit, will remove context');
    offlineContext = new AudioContext();
    offlineContext.pipe(speaker);
  } else {
    throw err;
  }
});

export class LocalSongController {
  private songsPlaying: string[] = [];
  private masterSynth?: Synth;
  private expectedTempo?: number;

  async getSongs(): Promise<string[]> {
    const response = await fetch(`${baseUrl}/songs`);
    if (response.status !== 200) {
      throw new Error('cannot fetch from songs endpoint');
    }

    return await response.json();
  }

  async getSong(songname: string): Promise<string> {
    const encodedSongname = encodeURIComponent(songname);
    const response = await fetch(`${baseUrl}/song?songname=${encodedSongname}`);
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
    // NOTE: legacy code. If I ever switch back to allowing multiple songs
    // at once, at least this'll still be there
    if (this.songsPlaying.includes(songname)) {
      return false;
    }

    try {
      if ((await this.getSongs()).includes(songname)) {
        if (this.masterSynth) {
          this.masterSynth.pause();
        }
        offlineContext.close();
        offlineContext = new AudioContext();
        offlineContext.pipe(speaker);

        const song = await this.getSong(songname);
        const synth = new Synth(song);
        // @ts-expect-error
        synth.audioCtx = offlineContext;
        this.masterSynth = synth;
        this.expectedTempo = synth.song!.tempo;
        synth.song!.loopLength = 0;
        synth.loopRepeatCount = 0;

        const oldPause = synth.pause.bind(synth);
        this.songsPlaying.push(songname);

        synth.pause = () => {
          this.songsPlaying = this.songsPlaying.filter((song) => song !== songname);
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

let controller = new LocalSongController();
let ws: WebSocket | undefined;

function handleWebSocketMessage(event: MessageEvent<string>) {
  const data = JSON.parse(event.data);
  switch (data.type) {
    case 'play':
      controller.playSong(data.songname);
      break;
    case 'cancel':
      controller.cancelSong();
      break;
    case 'changeSpeed':
      controller.changeSpeed(data.speed);
      break;
    default:
      console.warn('Unknown message type', data.type);
  }
}

function main() {
  if (ws) {
    ws.close();
  }

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('Connected to WebSocket');
  };
  ws.onmessage = (event) => {
    handleWebSocketMessage(event as any as MessageEvent<string>);
  };
  ws.onclose = () => {
    console.log('Disconnected from WebSocket');
  };
}

main();
