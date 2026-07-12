export class TrinketController {
  private socket: WebSocket;
  private disabled: boolean = false;

  constructor(enabled: boolean, senderUrl: string) {
    this.socket = new WebSocket(senderUrl);
    this.socket.onopen = () => {
      console.log('connected to remote distract controller');
    };

    this.socket.onclose = () => {
      console.log('disconnected from remote distract controller');
    };

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

    this.socket.send(
      JSON.stringify({ type: 'trinket', command: { type: 'distract', annoyance: Math.random() } })
    );
  }

  async sendRotate(): Promise<void> {
    if (this.disabled) {
      console.log('Trinkets are disabled');
      return;
    }

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
    this.socket.send(JSON.stringify({ type: 'trinket', command: { type: 'cancel' } }));
  }
}
