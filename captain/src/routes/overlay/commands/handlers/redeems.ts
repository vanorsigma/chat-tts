import type { OverlayDispatchers } from '../../dispatcher';
import type { ChatMessage } from '@twurple/chat';
import { checkCostAddIfEnough } from '../middleware';
import { requireUsername, withCostOrFreeUser } from './shared';
import { getOverlayConfig } from '../../constants';
import type {
  OverlayBlackSilenceConfig,
  OverlayCutConfig,
  OverlayFlashbangConfig,
  OverlayGrayscaleConfig,
  OverlayMaxwellConfig,
  OverlayMistakeConfig,
  OverlaySelfThoughtConfig
} from '$lib/config';
import {
  flashbangStore,
  blackSilenceStore,
  maxwellStore,
  mistakeStore,
  karmaStore,
  cutStore,
  rotateStore
} from '../../stores';
import type { CancelTTS, DisableTTS } from '$lib/remoteTTSMessages';
import { PUBLIC_SELF_THOUGHT_URL } from '$env/static/public';
import { random } from '$lib/utils';
import type { Commands } from '..';

let grayscaleDisableTimer: ReturnType<typeof setTimeout> | null = null;

function cancelBlackSilenceEffects(ws: WebSocket) {
  if (grayscaleDisableTimer) {
    clearTimeout(grayscaleDisableTimer);
    grayscaleDisableTimer = null;
  }
  ws.send(
    JSON.stringify({
      type: 'picom-shader',
      op: 'DISABLE',
      shader: getOverlayConfig().grayscaleConfig?.shader ?? ''
    })
  );
  cutStore.finish(ws);
}

export function triggerBlackSilenceEffects(ws: WebSocket) {
  blackSilenceStore.increment();
  karmaStore.updateKarma(getOverlayConfig().blackSilenceConfig.karma, 'Black Silence');
  cancelBlackSilenceEffects(ws);

  ws.send(
    JSON.stringify({
      type: 'tts',
      command: { type: 'cancel' }
    } as CancelTTS)
  );

  ws.send(
    JSON.stringify({
      type: 'tts',
      command: {
        type: 'disable',
        duration: getOverlayConfig().blackSilenceConfig.durationMs / 1000
      }
    } as DisableTTS)
  );
}

export async function maxwellHandler(
  dispatcher: OverlayDispatchers,
  message: ChatMessage,
  config: OverlayMaxwellConfig
) {
  const username = requireUsername(message);
  if (!username) return;

  await withCostOrFreeUser(dispatcher, message, config.user, config.cost, () => {
    maxwellStore.increment();
  });
}

export async function flashbangHandler(
  dispatcher: OverlayDispatchers,
  message: ChatMessage,
  config: OverlayFlashbangConfig
) {
  const username = requireUsername(message);
  if (!username) return;

  if (
    await checkCostAddIfEnough(dispatcher, message.channelId!, username, -config.cost, message.id)
  ) {
    flashbangStore.increment();
    karmaStore.updateKarma(config.karma, 'Flashbang');
    dispatcher.sendMessageAsUser(
      message.channelId!,
      `throwing a flashbang, -${config.cost}`,
      message.id
    );
  }
}

export async function blackSilenceHandler(
  dispatcher: OverlayDispatchers,
  message: ChatMessage,
  ws: WebSocket,
  config: OverlayBlackSilenceConfig
) {
  const username = requireUsername(message);
  if (!username) return;

  await withCostOrFreeUser(dispatcher, message, config.user, config.cost, () => {
    triggerBlackSilenceEffects(ws);
  });
}

export async function mistakeHandler(
  dispatcher: OverlayDispatchers,
  message: ChatMessage,
  config: OverlayMistakeConfig
) {
  const username = requireUsername(message);
  if (!username) return;

  await withCostOrFreeUser(dispatcher, message, config.user, config.cost, () => {
    mistakeStore.increment();
    karmaStore.updateKarma(config.karma, 'Mistake Redeem');
  });
}

export async function selfThoughtHandler(
  dispatcher: OverlayDispatchers,
  message: ChatMessage,
  config: OverlaySelfThoughtConfig
) {
  const username = requireUsername(message);
  if (!username) return;

  const text = message.text.split(' ').slice(1).join(' ');

  if (
    await checkCostAddIfEnough(dispatcher, message.channelId!, username, -config.cost, message.id)
  ) {
    const msg = encodeURIComponent(text);
    const response = await fetch(`${PUBLIC_SELF_THOUGHT_URL}/processMessage?message=${msg}`);
    if (response.status !== 200) {
      dispatcher.sendMessageAsUser(
        message.channelId!,
        'unable to do the self-thought, refunding u',
        message.id
      );

      (await checkCostAddIfEnough(
        dispatcher,
        message.channelId!,
        username,
        config.cost,
        message.id
      ))!;
    } else {
      karmaStore.updateKarma(config.karma, 'Self Thought');
      dispatcher.sendMessageAsUser(message.channelId!, `-${config.cost}`, message.id);
    }
  }
}

export async function grayscaleHandler(
  dispatcher: OverlayDispatchers,
  message: ChatMessage,
  ws: WebSocket,
  config: OverlayGrayscaleConfig
) {
  const username = requireUsername(message);
  if (!username) return;

  if (
    await checkCostAddIfEnough(dispatcher, message.channelId!, username, -config.cost, message.id)
  ) {
    karmaStore.updateKarma(config.karma, 'Grayscale');
    ws.send(
      JSON.stringify({
        type: 'picom-shader',
        op: 'ENABLE',
        shader: config.shader
      })
    );
    if (grayscaleDisableTimer) clearTimeout(grayscaleDisableTimer);
    grayscaleDisableTimer = setTimeout(() => {
      ws.send(
        JSON.stringify({
          type: 'picom-shader',
          op: 'DISABLE',
          shader: config.shader
        })
      );
      grayscaleDisableTimer = null;
    }, config.durationMs);
    dispatcher.sendMessageAsUser(message.channelId!, `-${config.cost}`, message.id);
  }
}

async function innerCutHandler(
  dispatcher: OverlayDispatchers,
  message: ChatMessage,
  ws: WebSocket,
  config: OverlayCutConfig,
  skipCost = false
) {
  const username = requireUsername(message);
  if (!username) return;
  if (!cutStore.hasCapacity) return;

  const doCut = () => {
    karmaStore.updateKarma(config.karma, 'Cut');
    cutStore.doCut(ws);
  };

  if (skipCost) {
    doCut();
    return;
  }

  await withCostOrFreeUser(dispatcher, message, config.user, config.cost, doCut);
}

export async function cutHandler(
  dispatcher: OverlayDispatchers,
  message: ChatMessage,
  ws: WebSocket,
  commands: Commands,
  config: OverlayCutConfig
) {
  if (!cutStore.videoActive) {
    console.debug('Cut session has not started yet!');
    commands.callOnlyIfPastCooldown('cut', dispatcher, message, () =>
      innerCutHandler(dispatcher, message, ws, config)
    );
    return;
  }
  console.debug('Cut session has started, bypassing cooldown restrictions.');
  innerCutHandler(dispatcher, message, ws, config, true);
}

export function rotateHandler(dispatcher: OverlayDispatchers, message: ChatMessage, ws: WebSocket) {
  const username = requireUsername(message);
  if (!username) return;

  const speed = (random() > 0.5 ? -1 : 1) * 10 ** (random() * 3);
  const durationMs = 60000 / Math.abs(speed);

  rotateStore.doRotate(ws, Math.sign(speed) * 360, durationMs);
  dispatcher.sendMessageAsUser(message.channelId!, 'spinning the screen', message.id);
}
