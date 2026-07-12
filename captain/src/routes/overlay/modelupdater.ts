import { PUBLIC_MODEL_WS_URL } from '$env/static/public';

interface ToggleBlendshapeUpdate {
  command_name: 'toggle_blendshape';
  args: {
    name: string;
    value: number;
  };
}

interface EnableBlendshapeUpdate {
  command_name: 'set_blendshape_value';
  args: {
    name: string;
  };
}

export class ModelUpdater {
  private ws: WebSocket;
  constructor() {
    this.ws = this.makeWS();
  }

  makeWS() {
    const ws = new WebSocket(PUBLIC_MODEL_WS_URL);
    ws.onopen = () => console.log('Model WS URL is up');
    ws.onmessage = () => {};
    ws.onclose = this._onclose;

    return ws;
  }

  private _onclose() {
    setTimeout(() => {
      this.ws = this.makeWS();
    }, 5000);
  }

  setBlendShape(blend_name: string, value: number) {
    this.ws.send(
      JSON.stringify({
        command_name: 'set_blendshape_value',
        args: {
          name: blend_name,
          value
        }
      } as EnableBlendshapeUpdate)
    );
  }

  toggleBlendShape(blend_name: string) {
    this.ws.send(
      JSON.stringify({
        command_name: 'toggle_blendshape',
        args: {
          name: blend_name
        }
      } as ToggleBlendshapeUpdate)
    );
  }
}
