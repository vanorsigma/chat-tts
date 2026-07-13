import { existsSync, readFileSync, watch } from 'fs';
import { join } from 'path';
import WebSocket from 'ws';
import { setBroadcastFn } from './logger';
import type { FakerMessage, ControlMessage } from '$lib/bus/messages';

const BUS_URL = 'ws://localhost:3001';

let controller: unknown = null;

type ConfigChangeHandler = (rawYaml: string) => void;

let _initialized = false;
let senderWs: WebSocket | null = null;
let receiverWs: WebSocket | null = null;
let _configWatcher: ReturnType<typeof watch> | null = null;
let onConfigChange: ConfigChangeHandler | null = null;
let fakerHandler: ((msg: FakerMessage) => void) | null = null;
let controlHandler: ((msg: ControlMessage) => void) | null = null;

function wireLogger() {
  setBroadcastFn((entry) => {
    if (senderWs && senderWs.readyState === WebSocket.OPEN) {
      senderWs.send(JSON.stringify(entry));
    }
  });
}

function connectToBus() {
  senderWs = new WebSocket(`${BUS_URL}/senders`);
  senderWs.on('open', () => {
    wireLogger();
  });
  senderWs.on('error', () => {
    setTimeout(connectToBus, 2000);
  });

  receiverWs = new WebSocket(`${BUS_URL}/receivers`);
  receiverWs.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'faker' && fakerHandler) {
        fakerHandler(msg as FakerMessage);
      } else if (msg.type === 'control' && controlHandler) {
        controlHandler(msg as ControlMessage);
      }
    } catch {
      // ignore malformed messages
    }
  });
  receiverWs.on('error', () => {
    setTimeout(connectToBus, 2000);
  });
}

const CONFIG_PATH = join(process.cwd(), 'config.yml');

function readConfig(): string | null {
  if (!existsSync(CONFIG_PATH)) return null;
  return readFileSync(CONFIG_PATH, 'utf-8');
}

function startConfigWatcher() {
  _configWatcher = watch(CONFIG_PATH, () => {
    const raw = readConfig();
    if (raw && onConfigChange) {
      onConfigChange(raw);
    }
  });
}

export function initializeRuntime() {
  if (_initialized) return;
  _initialized = true;

  connectToBus();

  const raw = readConfig();
  if (raw && onConfigChange) {
    onConfigChange(raw);
  }
  startConfigWatcher();
}

export function getController(): unknown {
  return controller;
}

export function setController(c: unknown) {
  controller = c;
}

export function setFakerHandler(handler: (msg: FakerMessage) => void) {
  fakerHandler = handler;
}

export function setControlHandler(handler: (msg: ControlMessage) => void) {
  controlHandler = handler;
}

export function setConfigChangeHandler(handler: ConfigChangeHandler) {
  onConfigChange = handler;
}

export { BUS_URL as getBusUrl };
