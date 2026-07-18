import { getOverlayConfig } from './constants';
import { ReconnectingWebSocket } from './stores/reconnectingWs';
import { GLOBAL_PROVIDER_REGISTRY, type StockProvider } from './stock/providers';
import { HEART_ICON } from './stock/icons';
import { createPubSub } from './stores/pubsub';

interface HeartrateConfig {
  timestamp: number;
  data: { heartRate: number };
}

function isHeartrateConfig(data: unknown): data is HeartrateConfig {
  return typeof data === 'object' && data !== null && 'timestamp' in data && 'data' in data;
}

export class Heartrate implements StockProvider {
  readonly symbol = 'HEART';
  readonly label = 'Heartrate';
  readonly icon = HEART_ICON;
  readonly color = 'rgb(4, 187, 175)';
  private ws: ReconnectingWebSocket;
  private pub = createPubSub<number>();
  private _current: number;

  constructor(url: string) {
    this._current = getOverlayConfig().model.initialHeartrate;
    this.ws = new ReconnectingWebSocket(url);
    this.ws.onmessage = (data) => this.onMessage(data);
    GLOBAL_PROVIDER_REGISTRY.register(this);
  }

  get current(): number {
    return this._current;
  }

  public subscribe(fn: (value: number) => void) {
    fn(this._current);
    return this.pub.subscribe(fn);
  }

  public onMessage(raw: string): void {
    try {
      const data = JSON.parse(raw);
      if (!isHeartrateConfig(data)) {
        console.error('unknown message in heartrate websocket');
        return;
      }

      this._current = data.data.heartRate;
      this.pub.notify(this._current);
    } catch (e) {
      console.error('Failed to parse heartrate message:', e);
    }
  }
}
