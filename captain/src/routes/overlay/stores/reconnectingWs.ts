export class ReconnectingWebSocket {
  private url: string;
  private ws: WebSocket | null = null;
  private _onmessage: ((data: string) => void) | null = null;
  private _onopen: (() => void) | null = null;
  private reconnectDelay = 5000;

  get readyState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED;
  }

  constructor(url: string) {
    this.url = url;
    this.connect();
  }

  get onmessage(): ((data: string) => void) | null {
    return this._onmessage;
  }

  set onmessage(fn: ((data: string) => void) | null) {
    this._onmessage = fn;
    if (this.ws) this.bindOnMessage();
  }

  get onopen(): (() => void) | null {
    return this._onopen;
  }

  set onopen(fn: (() => void) | null) {
    this._onopen = fn;
    if (this.ws) this.bindOnOpen();
  }

  send(data: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    }
  }

  reconnect() {
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
    }
    this.connect();
  }

  close() {
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
    }
    this.ws = null;
  }

  private connect() {
    const ws = new WebSocket(this.url);
    this.bindOnOpen();
    this.bindOnMessage();
    ws.onerror = () => {
      this.scheduleReconnect();
    };
    ws.onclose = () => {
      this.scheduleReconnect();
    };
    this.ws = ws;
  }

  private bindOnOpen() {
    if (!this.ws) return;
    this.ws.onopen = () => {
      if (this._onopen) this._onopen();
    };
  }

  private bindOnMessage() {
    if (!this.ws) return;
    this.ws.onmessage = (ev) => {
      if (this._onmessage) this._onmessage(ev.data);
    };
  }

  private scheduleReconnect() {
    setTimeout(() => {
      const state = this.ws?.readyState;
      if (state === WebSocket.CLOSED || state === WebSocket.CLOSING) {
        this.connect();
      }
    }, this.reconnectDelay);
  }
}
