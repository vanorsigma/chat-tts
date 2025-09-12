/**
 * Svelte store compatible heart-rate monitor
 */

interface HeartrateConfig {
  timestamp: number;
  data: { heartRate: number };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isHeartrateConfig(data: any): data is HeartrateConfig {
  return 'timestamp' in data && 'data' in data;
}

export class Heartrate {
  private ws: WebSocket;
  private subscribers: Array<(value: number) => void>;

  /**
   * Please pass a fully authenticated URL to this class. This includes the access token and response mode if possible
   */
  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.subscribers = [];

    this.ws.onopen = () => console.log('Heart Rate socket opened');
    this.ws.onclose = () => console.log('Heart Rate socket closed');
    this.ws.onmessage = (ev) => this.onMessage(ev.data);
  }

  public subscribe(fn: (value: number) => void): () => void {
    this.subscribers.push(fn);
    return () => {
      this.subscribers = this.subscribers.filter((f) => f !== fn);
    };
  }

  public onMessage(raw: string): void {
    const data = JSON.parse(raw);
    if (!isHeartrateConfig(data)) {
      console.error('unknown message in heartrate websocket');
      return;
    }

    this.subscribers.forEach((cb) => cb(data.data.heartRate));
  }
}
