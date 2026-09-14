import type { ChatMessage } from '@twurple/chat';
import type { OverlayDispatchers } from '../../dispatcher';
import type { OverlayMomentConfig } from '$lib/config';
import { checkCostAddIfEnough } from '../middleware';
import { requireUsername } from './shared';

export async function momentHandler(
  dispatcher: OverlayDispatchers,
  message: ChatMessage,
  config: OverlayMomentConfig
) {
  const username = requireUsername(message);
  if (!username) return;

  const description = message.text.trim().split(/\s+/).slice(1).join(' ').trim();

  const channelId = message.channelId!;
  const marker = `MOMENT: ${description}`;

  if (config.reward > 0) {
    if (await checkCostAddIfEnough(dispatcher, channelId, username, config.reward, message.id)) {
      dispatcher.sendMessageAsUser(channelId, `+${config.reward} vanorDollars`, message.id);
    }
  }

  const ok = await fetch('/api/twitch/marker', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ description: marker })
  })
    .then((res) => res.ok)
    .catch((e) => {
      console.warn('momentHandler: failed to create marker', e);
      return false;
    });

  dispatcher.sendMessageAsUser(channelId, ok ? marker : `failed to create ${marker}`, message.id);
}
