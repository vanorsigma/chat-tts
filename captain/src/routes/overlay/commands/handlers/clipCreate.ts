import type { ChatMessage } from '@twurple/chat';
import type { Commands } from '../index';
import type { OverlayDispatchers } from '../../dispatcher';
import type { OverlayClipConfig } from '$lib/config';
import { checkCostAddIfEnough } from '../middleware';
import { requireUsername } from './shared';
import { karmaStore, showClipStore } from '../../stores';
import { parseDuration } from '$lib/duration';

const CLIP_SHOW_DELAY_MS = 15000;
const DEFAULT_CLIP_DURATION_SEC = 30;
const MIN_CLIP_DURATION_SEC = 5;
const MAX_CLIP_DURATION_SEC = 60;
const MAX_CLIP_TITLE_LENGTH = 100;

function parseClipOptions(args: string[]): { title?: string; duration: number } {
  if (args.length === 0) return { duration: DEFAULT_CLIP_DURATION_SEC };

  const last = args[args.length - 1];
  const seconds = parseDuration(last);
  const explicitUnit = /[smh]/i.test(last);
  const inRange =
    seconds !== null && seconds >= MIN_CLIP_DURATION_SEC && seconds <= MAX_CLIP_DURATION_SEC;

  if (seconds !== null && (explicitUnit || inRange)) {
    const title = args.slice(0, -1).join(' ').trim();
    return {
      title: title ? title.slice(0, MAX_CLIP_TITLE_LENGTH) : undefined,
      duration: Math.min(Math.max(seconds, MIN_CLIP_DURATION_SEC), MAX_CLIP_DURATION_SEC)
    };
  }

  const title = args.join(' ').trim();
  return {
    title: title ? title.slice(0, MAX_CLIP_TITLE_LENGTH) : undefined,
    duration: DEFAULT_CLIP_DURATION_SEC
  };
}

export async function clipCreateHandler(
  commands: Commands,
  dispatcher: OverlayDispatchers,
  message: ChatMessage,
  config: OverlayClipConfig
) {
  const username = requireUsername(message);
  const userId = message.userInfo.userId;
  const channelId = message.channelId!;

  if (!username || !userId) return;

  const options = parseClipOptions(message.text.split(/\s+/).slice(1).filter(Boolean));

  const res = await fetch('/api/clip/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, title: options.title, duration: options.duration })
  });

  if (res.status === 401) {
    const body = (await res.json().catch(() => null)) as { authUrl?: string } | null;
    const link = body?.authUrl
      ? `link your twitch here: ${body.authUrl}`
      : 'tell vanor to set up the clip store';
    dispatcher.sendMessageAsUser(channelId, `@${username} not linked - ${link}`, message.id);
    return;
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    dispatcher.sendMessageAsUser(channelId, body?.error ?? 'failed to create clip', message.id);
    return;
  }

  const data = (await res.json()) as { url: string; id: string };

  setTimeout(
    () => showClipStore.show(data.id, { title: options.title, author: username }),
    CLIP_SHOW_DELAY_MS
  );

  if (config.points > 0) {
    if (await checkCostAddIfEnough(dispatcher, channelId, username, config.points, message.id)) {
      dispatcher.sendMessageAsUser(channelId, `+${config.points} vanorDollars`, message.id);
    }
  }
  if (config.karma > 0) {
    karmaStore.updateKarma(config.karma, 'Clip');
  }

  commands.busWs?.send(
    JSON.stringify({
      type: 'clip-created',
      url: data.url,
      id: data.id,
      username,
      ts: Date.now()
    })
  );

  dispatcher.sendMessageAsUser(channelId, `clip created: ${data.url}`, message.id);
}
