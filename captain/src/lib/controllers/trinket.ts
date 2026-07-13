import type WebSocket from 'ws';

export class TrinketController {
  private socket: WebSocket;
  private disabled: boolean = false;

  constructor(enabled: boolean, socket: WebSocket) {
    this.socket = socket;
    this.disabled = !enabled;
  }

  get enabled() {
    return !this.disabled;
  }

  enable(invert: boolean = false) {
    this.disabled = invert;
  }

  async sendDistract(): Promise<void> {
    if (this.disabled) {
      console.log('Trinkets are disabled');
      return;
    }

    console.log('Sending distraction...');
    this.socket.send(
      JSON.stringify({ type: 'trinket', command: { type: 'distract', annoyance: Math.random() } })
    );
  }

  async sendRotate(): Promise<void> {
    if (this.disabled) {
      console.log('Trinkets are disabled');
      return;
    }

    console.log('Sending rotation...');
    this.socket.send(
      JSON.stringify({
        type: 'trinket',
        command: {
          type: 'rotate',
          speed: (Math.random() > 0.5 ? -1 : 1) * 10 ** (Math.random() * 3)
        }
      })
    );
  }

  async cancel(): Promise<void> {
    console.log('Cancelling trinkets.');
    this.socket.send(JSON.stringify({ type: 'trinket', command: { type: 'cancel' } }));
  }
}
