import { PUBLIC_MODEL_WS_URL } from '$env/static/public';
import { ReconnectingWebSocket } from './stores/reconnectingWs';

export class ModelUpdater {
  private ws: ReconnectingWebSocket;

  constructor() {
    this.ws = new ReconnectingWebSocket(PUBLIC_MODEL_WS_URL);
  }

  showBlendShape(blend_name: string) {
    this.ws.send(`show_${blend_name}`);
  }

  hideBlendShape(blend_name: string) {
    this.ws.send(`hide_${blend_name}`);
  }
}
