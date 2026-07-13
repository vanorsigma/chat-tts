import { PUBLIC_MODEL_WS_URL } from '$env/static/public';
import { ReconnectingWebSocket } from './stores/reconnectingWs';

interface EnableBlendshapeUpdate {
  command_name: 'set_blendshape_value';
  args: {
    name: string;
    value: number;
  };
}

export class ModelUpdater {
  private ws: ReconnectingWebSocket;

  constructor() {
    this.ws = new ReconnectingWebSocket(PUBLIC_MODEL_WS_URL);
  }

  setBlendShape(blend_name: string, value: number) {
    this.ws.send(
      JSON.stringify({
        command_name: 'set_blendshape_value',
        args: { name: blend_name, value }
      } as EnableBlendshapeUpdate)
    );
  }
}
