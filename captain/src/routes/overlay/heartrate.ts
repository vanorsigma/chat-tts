import { getOverlayConfig } from './constants';
import { ReconnectingWebSocket } from './stores/reconnectingWs';

interface HeartrateConfig {
  timestamp: number;
  data: { heartRate: number };
}

function isHeartrateConfig(data: unknown): data is HeartrateConfig {
  return typeof data === 'object' && data !== null && 'timestamp' in data && 'data' in data;
}

export class Heartrate {
  private ws: ReconnectingWebSocket;
  private subscribers: Array<(value: number) => void>;

  constructor(url: string) {
    this.subscribers = [];
    this.ws = new ReconnectingWebSocket(url);
    this.ws.onmessage = (data) => this.onMessage(data);
  }

  public subscribe(fn: (value: number) => void): () => void {
    this.subscribers.push(fn);
    fn(getOverlayConfig().model.initialHeartrate);
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
