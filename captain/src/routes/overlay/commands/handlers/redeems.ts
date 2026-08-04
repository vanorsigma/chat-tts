import type { OverlayDispatchers } from '../../dispatcher';
import type { ChatMessage } from '@twurple/chat';
import { checkCostAddIfEnough } from '../middleware';
import { requireUsername, withCostOrFreeUser } from './shared';
import { getOverlayConfig } from '../../constants';
import {
  flashbangStore,
  blackSilenceStore,
  maxwellStore,
  mistakeStore,
  karmaStore,
  cutStore
} from '../../stores';
import type { CancelTTS, DisableTTS } from '$lib/remoteTTSMessages';
import { PUBLIC_SELF_THOUGHT_URL } from '$env/static/public';
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
      shader: getOverlayConfig().grayscale.shader
    })
  );
  cutStore.finish(ws);
}

export function triggerBlackSilenceEffects(ws: WebSocket) {
  blackSilenceStore.increment();
  karmaStore.updateKarma(getOverlayConfig().blackSilence.karma, 'Black Silence');
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
        duration: getOverlayConfig().blackSilence.durationMs / 1000
      }
    } as DisableTTS)
  );
}

export async function maxwellHandler(dispatcher: OverlayDispatchers, message: ChatMessage) {
  const username = requireUsername(message);
  if (!username) return;

  await withCostOrFreeUser(
    dispatcher,
    message,
    getOverlayConfig().maxwell.user,
    getOverlayConfig().maxwell.cost,
    () => {
      maxwellStore.increment();
    }
  );
}

export async function flashbangHandler(dispatcher: OverlayDispatchers, message: ChatMessage) {
  const username = requireUsername(message);
  if (!username) return;

  if (
    await checkCostAddIfEnough(
      dispatcher,
      message.channelId!,
      username,
      -getOverlayConfig().flashbang.cost,
      message.id
    )
  ) {
    flashbangStore.increment();
    karmaStore.updateKarma(getOverlayConfig().flashbang.karma, 'Flashbang');
    dispatcher.sendMessageAsUser(
      message.channelId!,
      `throwing a flashbang, -${getOverlayConfig().flashbang.cost}`,
      message.id
    );
  }
}

export async function blackSilenceHandler(
  dispatcher: OverlayDispatchers,
  message: ChatMessage,
  ws: WebSocket
) {
  const username = requireUsername(message);
  if (!username) return;

  await withCostOrFreeUser(
    dispatcher,
    message,
    getOverlayConfig().blackSilence.user,
    getOverlayConfig().blackSilence.cost,
    () => {
      triggerBlackSilenceEffects(ws);
    }
  );
}

export async function mistakeHandler(dispatcher: OverlayDispatchers, message: ChatMessage) {
  const username = requireUsername(message);
  if (!username) return;

  await withCostOrFreeUser(
    dispatcher,
    message,
    getOverlayConfig().mistake.user,
    getOverlayConfig().mistake.cost,
    () => {
      mistakeStore.increment();
      karmaStore.updateKarma(getOverlayConfig().mistake.karma, 'Mistake Redeem');
    }
  );
}

export async function selfThoughtHandler(dispatcher: OverlayDispatchers, message: ChatMessage) {
  const username = requireUsername(message);
  if (!username) return;

  const text = message.text.split(' ').slice(1).join(' ');

  if (
    await checkCostAddIfEnough(
      dispatcher,
      message.channelId!,
      username,
      -getOverlayConfig().selfThought.cost,
      message.id
    )
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
        getOverlayConfig().selfThought.cost,
        message.id
      ))!;
    } else {
      karmaStore.updateKarma(getOverlayConfig().selfThought.karma, 'Self Thought');
      dispatcher.sendMessageAsUser(
        message.channelId!,
        `-${getOverlayConfig().selfThought.cost}`,
        message.id
      );
    }
  }
}

export async function grayscaleHandler(
  dispatcher: OverlayDispatchers,
  message: ChatMessage,
  ws: WebSocket
) {
  const username = requireUsername(message);
  if (!username) return;

  if (
    await checkCostAddIfEnough(
      dispatcher,
      message.channelId!,
      username,
      -getOverlayConfig().grayscale.cost,
      message.id
    )
  ) {
    karmaStore.updateKarma(getOverlayConfig().grayscale.karma, 'Grayscale');
    ws.send(
      JSON.stringify({
        type: 'picom-shader',
        op: 'ENABLE',
        shader: getOverlayConfig().grayscale.shader
      })
    );
    if (grayscaleDisableTimer) clearTimeout(grayscaleDisableTimer);
    grayscaleDisableTimer = setTimeout(() => {
      ws.send(
        JSON.stringify({
          type: 'picom-shader',
          op: 'DISABLE',
          shader: getOverlayConfig().grayscale.shader
        })
      );
      grayscaleDisableTimer = null;
    }, getOverlayConfig().grayscale.durationMs);
    dispatcher.sendMessageAsUser(
      message.channelId!,
      `-${getOverlayConfig().grayscale.cost}`,
      message.id
    );
  }
}

async function innerCutHandler(
  dispatcher: OverlayDispatchers,
  message: ChatMessage,
  ws: WebSocket
) {
  const username = requireUsername(message);
  if (!username) return;
  if (!cutStore.hasCapacity) return;

  await withCostOrFreeUser(
    dispatcher,
    message,
    getOverlayConfig().cut.user,
    getOverlayConfig().cut.cost,
    () => {
      karmaStore.updateKarma(getOverlayConfig().cut.karma, 'Cut');
      cutStore.doCut(ws);
    }
  );
}

export async function cutHandler(
  dispatcher: OverlayDispatchers,
  message: ChatMessage,
  ws: WebSocket,
  commands: Commands
) {
  if (!cutStore.videoActive) {
    console.debug('Cut session has not started yet!');
    commands.callOnlyIfPastCooldown('cut', dispatcher, message, () =>
      innerCutHandler(dispatcher, message, ws)
    );
    return;
  }
  console.debug('Cut session has started, bypassing cooldown restrictions.');
  innerCutHandler(dispatcher, message, ws);
}
