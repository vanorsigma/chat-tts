import WebSocket from 'ws';
import { random } from '$lib/utils';

export class TrinketController {
  private getSocket: () => WebSocket | null;
  private disabled: boolean = false;

  constructor(enabled: boolean, getSocket: () => WebSocket | null) {
    this.getSocket = getSocket;
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

    const socket = this.getSocket();
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      console.error('Cannot send distraction: bus socket is not connected');
      return;
    }

    console.log('Sending distraction...');
    socket.send(
      JSON.stringify({ type: 'trinket', command: { type: 'distract', annoyance: random() } })
    );
  }

  async cancel(): Promise<void> {
    const socket = this.getSocket();
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      console.error('Cannot cancel trinkets: bus socket is not connected');
      return;
    }

    console.log('Cancelling trinkets.');
    socket.send(JSON.stringify({ type: 'trinket', command: { type: 'cancel' } }));
  }
}
