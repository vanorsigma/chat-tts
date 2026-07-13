import type { OverlayDispatchers } from '../../dispatcher';
import type { ChatMessage } from '@twurple/chat';
import { checkCostAddIfEnough } from '../middleware';
import { requireUsername, withCostOrFreeUser } from './shared';
import * as Constants from '../../constants';
import { flashbangStore, blackSilenceStore, maxwellStore, mistakeStore, karmaStore } from '../../stores';
import type { CancelTTS, DisableTTS } from '$lib/remoteTTSMessages';
import { PUBLIC_SELF_THOUGHT_URL } from '$env/static/public';

export async function maxwellHandler(dispatcher: OverlayDispatchers, message: ChatMessage) {
  const username = requireUsername(message);
  if (!username) return;

  await withCostOrFreeUser(dispatcher, message, Constants.MAXWELL_USER, Constants.MAXWELL_COST, () => {
    maxwellStore.increment();
  });
}

export async function flashbangHandler(dispatcher: OverlayDispatchers, message: ChatMessage) {
  const username = requireUsername(message);
  if (!username) return;

  if (Math.random() < 0.5 || message.userInfo.isBroadcaster) {
    if (
      await checkCostAddIfEnough(
        dispatcher,
        message.channelId!,
        username,
        -Constants.FLASHBANG_COST,
        undefined,
        message.id
      )
    ) {
      flashbangStore.increment();
      karmaStore.updateKarma(Constants.FLASHBANG_KARMA, 'Flashbang');
      dispatcher.sendMessageAsUser(
        message.channelId!,
        `throwing a flashbang, -${Constants.FLASHBANG_COST}`,
        message.id
      );
    }
  } else {
    dispatcher.sendMessageAsUser(message.channelId!, 'NO xdHAH', message.id);
  }
}

export function blackSilenceHandler(
  dispatcher: OverlayDispatchers,
  message: ChatMessage,
  ws: WebSocket
) {
  const username = requireUsername(message);
  if (!username) return;

  (async () => {
    await withCostOrFreeUser(
      dispatcher,
      message,
      Constants.BLACK_SILENCE_USER,
      Constants.BLACK_SILENCE_COST,
      () => {
        blackSilenceStore.increment();
        karmaStore.updateKarma(Constants.BLACK_SILENCE_KARMA, 'Black Silence');

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
              duration: Constants.BLACK_SILENCE_DURATION / 1000
            }
          } as DisableTTS)
        );
      }
    );
  })();
}

export async function mistakeHandler(dispatcher: OverlayDispatchers, message: ChatMessage) {
  const username = requireUsername(message);
  if (!username) return;

  await withCostOrFreeUser(dispatcher, message, Constants.MISTAKE_USER, Constants.MISTAKE_COST, () => {
    mistakeStore.increment();
    karmaStore.updateKarma(Constants.MISTAKE_KARMA, 'Mistake Redeem');
  });
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
      -Constants.SELF_THOUGHT_COST,
      undefined,
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
        Constants.SELF_THOUGHT_COST,
        undefined,
        message.id
      ))!;
    } else {
      karmaStore.updateKarma(Constants.SELF_THOUGHT_KARMA, 'Self Thought');
      dispatcher.sendMessageAsUser(message.channelId!, `-${Constants.SELF_THOUGHT_COST}`, message.id);
    }
  }
}
