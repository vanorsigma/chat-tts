import type { ChatMessage } from '@twurple/chat';
import type { OverlayDispatchers } from '../../dispatcher';
import type { OverlayShowClipConfig } from '$lib/config';
import { parseTwitchClipId } from '$lib/clips/parse';
import { withCostOrFreeUser } from './shared';
import { showClipStore } from '../../stores';

type ClipInfoResult = { ok: true; title?: string } | { ok: false; message: string };

async function requestClipInfo(clipId: string): Promise<ClipInfoResult> {
  try {
    const res = await fetch(`/api/clip/${clipId}/info`);
    if (res.ok) {
      const info = (await res.json()) as { title?: string };
      return { ok: true, title: info.title };
    }

    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    return { ok: false, message: body?.message ?? 'failed to load that clip' };
  } catch (e) {
    console.warn('showClipHandler: failed to load clip info', e);
    return { ok: false, message: 'failed to load that clip' };
  }
}

export async function showClipHandler(
  dispatcher: OverlayDispatchers,
  message: ChatMessage,
  config: OverlayShowClipConfig
) {
  const input = message.text.split(/\s+/).slice(1).join(' ').trim();
  const clipId = parseTwitchClipId(input);
  if (!clipId) {
    dispatcher.sendMessageAsUser(
      message.channelId!,
      'not a valid twitch clip url or id',
      message.id
    );
    return;
  }

  const info = await requestClipInfo(clipId);
  if (!info.ok) {
    dispatcher.sendMessageAsUser(message.channelId!, info.message, message.id);
    return;
  }

  await withCostOrFreeUser(dispatcher, message, config.user, config.cost, () => {
    showClipStore.show(clipId, info.title);
  });
}
