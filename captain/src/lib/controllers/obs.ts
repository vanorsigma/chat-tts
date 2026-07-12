import { writable, type Writable } from 'svelte/store';
import type { ObsSettings } from '../config';
import OBSWebSocket from 'obs-websocket-js';
import type { ChatUser } from '@twurple/chat';
import { sleep } from '../utils';
import type { NewVoiceSettings } from './voice';

export class ObsController {
  obs: OBSWebSocket;
  settings: ObsSettings;
  connected: Writable<boolean>;
  _connected: boolean;
  private rotating: boolean;

  cancellations: Array<ReturnType<typeof setTimeout>> = [];

  constructor(settings: ObsSettings) {
    this.obs = new OBSWebSocket();
    this.settings = settings;
    this.connected = writable(false);
    this._connected = false;
    this.rotating = false;
  }

  private setConnected(val: boolean) {
    this.connected.set(val);
    this._connected = val;
  }

  stringToColour(str: string): number {
    let hash = 0;
    str.split('').forEach((char) => {
      hash = char.charCodeAt(0) + ((hash << 5) - hash);
    });
    let color = 'FF';
    for (let i = 0; i < 3; i++) {
      const value = (hash >> (i * 8)) & 0xff;
      color += value.toString(16).padStart(2, '0');
    }
    return Number('0x' + color);
  }

  async connect() {
    await this.obs.connect(this.settings.obsURL, this.settings.password);
    this.obs.addListener('ConnectionClosed', () => {
      this.setConnected(false);
      console.log('Connection closed, retrying...');

      const timeoutHandle = setTimeout(async () => {
        await this.connect();
        this.cancellations = this.cancellations.filter((val) => val !== timeoutHandle);
      }, 5000);

      this.cancellations.push(timeoutHandle);
    });

    console.log('Connected from WS successfully');
    this.setConnected(true);
  }

  async disconnect() {
    await this.obs.disconnect();
    console.log('Disconnected from WS successfully');
    this.setConnected(false);
  }

  async updateSceneWith(user: ChatUser, voice: NewVoiceSettings) {
    const color = this.stringToColour(voice.voice_name);
    await this.obs.call('SetInputSettings', {
      inputName: this.settings.sourceName,
      inputSettings: {
        text: `${user.userName}`,
        color1: color,
        color2: color
      }
    });
  }

  async rotateSourcesRandomly(sourceNames: string[]) {
    if (this.rotating) {
      return;
    }
    this.rotating = true;

    const sceneItemMappings: Array<{ itemId: number; rotation: number; speed: number }> = [];
    const { sceneName } = await this.obs.call('GetCurrentProgramScene');
    for (const sourceName of sourceNames) {
      const { sceneItemId } = await this.obs.call('GetSceneItemId', {
        sceneName,
        sourceName
      });

      if (sceneItemId === undefined) {
        throw new Error('scene item id is undefined');
      }

      const { sceneItemTransform } = await this.obs.call('GetSceneItemTransform', {
        sceneName,
        sceneItemId
      });
      const { rotation } = sceneItemTransform;

      if (rotation === undefined || rotation == null) {
        throw new Error('rotation is undefined');
      }

      const array = new Uint32Array(1);
      self.crypto.getRandomValues(array);

      const numRotation = Number(rotation);
      sceneItemMappings.push({
        itemId: sceneItemId,
        rotation: numRotation,
        speed: (array[0] / 4294967295) * 2.0 - 1.0
      });
    }

    const promises = sceneItemMappings.map(async (mapping) => {
      for (let i = 0; i <= 360; i++) {
        let newAngle = 0;

        if (mapping.speed < 0) {
          newAngle = (mapping.rotation - i + 360) % 360;
        } else {
          newAngle = (mapping.rotation + i) % 360;
        }

        await this.obs.call('SetSceneItemTransform', {
          sceneName,
          sceneItemId: mapping.itemId,
          sceneItemTransform: {
            rotation: newAngle
          }
        });
        await sleep(1 * (1 / Math.abs(mapping.speed)));
      }
    });

    await Promise.all(promises);

    this.rotating = false;
  }

  async resetSourceRotation(sourceName: string) {
    const { sceneName } = await this.obs.call('GetCurrentProgramScene');

    const { sceneItemId } = await this.obs.call('GetSceneItemId', {
      sceneName,
      sourceName
    });

    if (sceneItemId === undefined) {
      throw new Error('scene item id is undefined');
    }

    await this.obs.call('SetSceneItemTransform', {
      sceneName,
      sceneItemId: sceneItemId,
      sceneItemTransform: {
        rotation: 0,
        scaleX: 1.0,
        scaleY: 1.0
      }
    });
  }
}
