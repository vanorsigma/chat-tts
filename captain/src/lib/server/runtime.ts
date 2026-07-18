import { existsSync, readFileSync, watch } from 'fs';
import { join } from 'path';
import WebSocket from 'ws';
import { parse } from 'yaml';
import { setBroadcastFn } from './logger';
import { Controller } from '$lib/controllers';
import { ParseableConfig } from '$lib/config';
import { createFakeMessage } from '$lib/bus/fakeMessage';
import type { FakerMessage, FakerSubMessage, FakerBitsMessage, ControlMessage } from '$lib/bus/messages';
import { setSubTier, addBitBoost } from './db';
import { isRemoteTTSMessage, type RemoteTTSMessages } from '$lib/remoteTTSMessages';

const BUS_URL = 'ws://localhost:3001';
const CONFIG_PATH = join(process.cwd(), 'config.yml');

let controller: Controller | null = null;

let _initialized = false;
let senderWs: WebSocket | null = null;
let receiverWs: WebSocket | null = null;
let _configWatcher: ReturnType<typeof watch> | null = null;

function wireLogger() {
  setBroadcastFn((entry) => {
    if (senderWs && senderWs.readyState === WebSocket.OPEN) {
      senderWs.send(JSON.stringify(entry));
    }
  });
}

function handleFaker(msg: FakerMessage) {
  if (!controller) {
    console.warn('No controller active, ignoring faker message');
    return;
  }
  const fake = createFakeMessage(msg.text, msg.displayName);
  controller.updateWithMessage(fake);
}

function handleFakerSub(msg: FakerSubMessage) {
  const name = msg.displayName?.trim() || 'Faker';
  setSubTier(name, msg.tier).catch((e) => console.warn('Failed to set fake sub tier:', e));
  console.log(`Faker sub: ${name} tier ${msg.tier}`);
}

function handleFakerBits(msg: FakerBitsMessage) {
  const name = msg.displayName?.trim() || 'Faker';
  addBitBoost(name, msg.amount).catch((e) => console.warn('Failed to add fake bits:', e));
  console.log(`Faker bits: ${name} amount ${msg.amount}`);
}

function handleTTS(msg: RemoteTTSMessages) {
  if (!controller?.remoteChatTTSController) {
    console.warn('No remote TTS controller active, ignoring TTS message');
    return;
  }
  controller.remoteChatTTSController.handleMessage(msg);
}

function handleControl(msg: ControlMessage) {
  if (!controller) {
    console.warn('No controller active, ignoring control message');
    return;
  }
  switch (msg.op) {
    case 'cancel':
      controller.cancel();
      break;
    case 'blackSilence':
      controller.trinketController?.enable(controller.trinketController?.enabled);
      break;
    case 'setEnabled':
      controller.setEnabled(msg.enabled ?? !controller.enabled);
      break;
  }
}

let _pendingConfig: string | null = null;

function connectToBus() {
  console.log('Connecting to the bus...');
  senderWs = new WebSocket(`${BUS_URL}/senders`);
  senderWs.on('open', () => {
    wireLogger();
    console.log('Connected to the sender bus');
    if (_pendingConfig) {
      const raw = _pendingConfig;
      _pendingConfig = null;
      reloadConfig(raw);
    }
  });
  senderWs.on('error', () => {
    console.error(
      'Unable to connect to the sender bus. We will retry, but this is typically a much more serious issue'
    );
    setTimeout(connectToBus, 2000);
  });

  receiverWs = new WebSocket(`${BUS_URL}/receivers`);
  receiverWs.on('open', () => {
    console.log('Connected to the receiver bus');
  });
  receiverWs.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'faker') {
        handleFaker(msg as FakerMessage);
      } else if (msg.type === 'faker-sub') {
        handleFakerSub(msg as FakerSubMessage);
      } else if (msg.type === 'faker-bits') {
        handleFakerBits(msg as FakerBitsMessage);
      } else if (msg.type === 'control') {
        handleControl(msg as ControlMessage);
      } else if (msg.type === 'tts' && isRemoteTTSMessage(msg)) {
        handleTTS(msg as RemoteTTSMessages);
      }
    } catch {
      console.warn('Received a malformed message, ignoring.');
    }
  });
  receiverWs.on('error', () => {
    console.error(
      'Unable to connect to the receiver bus. We will retry, but this is typically a much more serious issue'
    );
    setTimeout(connectToBus, 2000);
  });
}

function readConfig(): string | null {
  if (!existsSync(CONFIG_PATH)) return null;
  return readFileSync(CONFIG_PATH, 'utf-8');
}

function reloadConfig(rawYaml: string) {
  try {
    const parsed = new ParseableConfig(parse(rawYaml));
    const fullConfig = parsed.toFullConfig();

    if (!senderWs) {
      console.warn('Bus not connected yet, deferring config load');
      return;
    }

    if (controller) {
      controller.end().catch((e) => console.warn('Error ending controller:', e));
    }

    controller = new Controller(fullConfig, senderWs);
    controller.start();
    console.log('Config reloaded successfully');
  } catch (e) {
    console.error('Failed to reload config:', e);
  }
}

function startConfigWatcher() {
  console.log('Watching config file for changes...');
  _configWatcher = watch(CONFIG_PATH, () => {
    const raw = readConfig();
    if (!raw) return;
    if (!senderWs) {
      _pendingConfig = raw;
      return;
    }
    reloadConfig(raw);
  });
}

export function initializeRuntime() {
  if (_initialized) return;
  _initialized = true;

  console.log('Runtime initializing...');
  connectToBus();

  _pendingConfig = readConfig();

  startConfigWatcher();
}

export function getController(): Controller | null {
  return controller;
}

export function getSenderWs(): WebSocket | null {
  return senderWs;
}

export function getReceiverWs(): WebSocket | null {
  return receiverWs;
}

export { BUS_URL as getBusUrl };
