// Browserless beepbox
import process from 'node:process';
import { Writable } from 'node:stream';
import { spawn, ChildProcess } from 'node:child_process';
import { StreamAudioContext as AudioContext } from '@descript/web-audio-js';
import { Synth } from 'beepbox/esm/synth/synth';
import WebSocket from 'ws';

const baseUrl = 'http://localhost:4173';
const wsUrl = 'ws://localhost:3001/receivers';

class PipeWireSpeaker extends Writable {
  private proc: ChildProcess | null = null;
  private channels: number;
  private bitDepth: number;
  private sampleRate: number;
  private float: boolean;
  private pending: Array<{ chunk: Buffer; cb: (err?: Error | null) => void }> = [];
  private spawnThrottled = false;

  constructor(opts: { channels: number; bitDepth: number; sampleRate: number; float?: boolean }) {
    super();
    this.channels = opts.channels;
    this.bitDepth = opts.bitDepth;
    this.sampleRate = opts.sampleRate;
    this.float = opts.float ?? false;
  }

  private ensureProcess() {
    if (this.spawnThrottled) return;
    if (this.proc && !this.proc.stdin!.destroyed && this.proc.exitCode === null) return;

    const intFormats: Record<number, string> = { 8: 's8', 16: 's16', 24: 's24', 32: 's32' };
    const fmt = this.float && this.bitDepth === 32 ? 'f32' : intFormats[this.bitDepth] || 's16';

    this.proc = spawn(
      'pw-cat',
      [
        '--playback',
        '--raw',
        '--rate',
        String(this.sampleRate),
        '--channels',
        String(this.channels),
        '--format',
        fmt,
        '-'
      ],
      {
        env: {
          ...process.env,
          PIPEWIRE_NODE_NAME: 'beepbox',
          PIPEWIRE_PROPS: '{"application.name":"Beepbox","media.name":"Beepbox Player"}'
        },
        stdio: ['pipe', 'inherit', 'inherit']
      }
    );

    this.proc.on('error', (err) => {
      console.error('pw-cat error:', err.message);
    });

    this.proc.on('exit', (code, signal) => {
      if (code !== 0 && signal !== 'SIGTERM') {
        console.warn(`pw-cat exited (code=${code}, signal=${signal}), will respawn in 2s`);
        this.spawnThrottled = true;
        setTimeout(() => {
          this.spawnThrottled = false;
        }, 2000);
      }
      this.proc = null;
    });

    for (const { chunk, cb } of this.pending) {
      this.proc.stdin!.write(chunk, cb);
    }
    this.pending = [];
  }

  _write(chunk: Buffer, _encoding: string, callback: (error?: Error | null) => void) {
    this.ensureProcess();
    if (this.proc && this.proc.stdin && !this.proc.stdin.destroyed) {
      this.proc.stdin.write(chunk, callback);
    } else {
      this.pending.push({ chunk, cb: callback });
    }
  }

  _destroy(error: Error | null, callback: (error: Error | null) => void) {
    if (this.proc) {
      this.proc.kill();
      this.proc = null;
    }
    callback(error);
  }
}

let offlineContext = new AudioContext();
const speaker = new PipeWireSpeaker({
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
      console.log(`Song ${songname} already playing, skipping.`);
      return false;
    }

    try {
      if ((await this.getSongs()).includes(songname)) {
        console.log(`Playing song: ${songname}`);
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
      } else {
        console.warn(`Song ${songname} not found, cannot play.`);
      }
    } catch (e) {
      console.error('Problem with playing beepbox song: ', e);
      return false;
    }
    return false;
  }
}

const controller = new LocalSongController();
let ws: WebSocket | undefined;

function handleWebSocketMessage(event: MessageEvent<string>) {
  const data = JSON.parse(event.data);
  console.log(`Received WebSocket message: ${data.type}`);
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
  ws.onerror = () => {
    console.error('WebSocket error, will retry.');
    setTimeout(main, 2000);
  };
}

main();
