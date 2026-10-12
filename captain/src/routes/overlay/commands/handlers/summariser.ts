import type { ChatMessage } from '@twurple/chat';
import type { OverlayDispatchers } from '../../dispatcher';
import { requireUsername, withCostOrFreeUser } from './shared';
import { checkCostAddIfEnough } from '../middleware';
import { PUBLIC_SELF_THOUGHT_URL, PUBLIC_SUMMARISER_URL } from '$env/static/public';
import type { OverlaySummariserConfig } from '$lib/config';

const CHAT_LIMIT = 498; // body cap so the sent "~ " + body fits Twitch's 500

function clampForChat(text: string): string {
  return text.length <= CHAT_LIMIT ? text : `${text.slice(0, CHAT_LIMIT - 3)}...`;
}

export async function summaryHandler(
  dispatcher: OverlayDispatchers,
  message: ChatMessage,
  config: OverlaySummariserConfig
) {
  const username = requireUsername(message);
  if (!username) return;

  const charged = username !== config.user;
  await withCostOrFreeUser(dispatcher, message, config.user, config.cost, async () => {
    const channelId = message.channelId!;
    let text: string;
    try {
      const res = await fetch(`${PUBLIC_SUMMARISER_URL}/summary`);
      if (res.status !== 200) throw new Error(`summariser ${res.status}`);
      text = ((await res.json()) as { text: string }).text;
      await dispatcher.sendMessageAsUser(channelId, clampForChat(text), message.id);
    } catch (e) {
      console.warn('%summary failed:', String(e));
      if (charged) {
        await checkCostAddIfEnough(dispatcher, channelId, username, config.cost, message.id);
      }
      dispatcher.sendMessageAsUser(
        channelId,
        charged ? 'unable to summarise, refunding u' : 'unable to summarise',
        message.id
      );
      return;
    }

    try {
      const res = await fetch(
        `${PUBLIC_SELF_THOUGHT_URL}/processMessage?message=${encodeURIComponent(text)}`
      );
      if (!res.ok) console.warn('%summary TTS submission returned', res.status);
    } catch (e) {
      console.warn('%summary TTS submission failed:', String(e));
    }
  });
}
