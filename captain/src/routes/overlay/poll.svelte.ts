import { COMMAND_HELP } from './commands/registry';
import type { OverlayDispatchers } from './dispatcher';
import type { ChatMessage } from '@twurple/chat';

export interface PollOption {
  id?: string;
  name: string;
  votes: number;
  channelPoints?: number;
}

export interface Poll {
  id?: string;
  title: string;
  options: PollOption[] | undefined;
  totalVotes?: number;
  status?: 'active' | 'completed' | 'terminated';
  startDate?: string;
  endDate?: string;
}

function getPollParameters(
  message: string
): { title: string; duration: number; choices: string[] } | null {
  const rest = message.replace('%poll', '').trim();
  const splits = rest.split(';');
  if (splits.length < 3) return null;

  const title = splits[0];
  const duration = Number(splits[1]);
  const choices = splits.slice(2).filter(Boolean);

  if (
    !title ||
    isNaN(duration) ||
    duration < 15 ||
    duration > 1800 ||
    choices.length < 2 ||
    choices.length > 5
  ) {
    return null;
  }
  if (choices.some((c) => c.length < 1 || c.length > 25)) return null;

  return { title, duration, choices };
}

export async function pollCommandHandler(
  dispatcher: OverlayDispatchers,
  message: ChatMessage
): Promise<void> {
  if (!(message.userInfo.isMod || message.userInfo.isVip || message.userInfo.isBroadcaster)) {
    return;
  }

  const params = getPollParameters(message.text);
  if (!params) {
    dispatcher.sendMessageAsUser(
      message.channelId!,
      COMMAND_HELP['%poll'] ?? 'Invalid format',
      message.id
    );
    return;
  }

  try {
    const res = await fetch('/api/twitch/poll', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    if (!res.ok) {
      const err = await res.json();
      dispatcher.sendMessageAsUser(
        message.channelId!,
        `Failed to create poll: ${err.error ?? 'unknown error'}`,
        message.id
      );
      return;
    }
    dispatcher.sendMessageAsUser(message.channelId!, 'Poll created!', message.id);
  } catch (e) {
    console.error('Failed to call poll endpoint:', e);
    dispatcher.sendMessageAsUser(message.channelId!, 'Poll creation failed', message.id);
  }
}

export async function endPollCommandHandler(
  dispatcher: OverlayDispatchers,
  message: ChatMessage
): Promise<void> {
  if (!(message.userInfo.isMod || message.userInfo.isVip || message.userInfo.isBroadcaster)) {
    return;
  }

  try {
    const res = await fetch('/api/twitch/poll/end', { method: 'POST' });
    if (!res.ok) {
      const err = await res.json();
      dispatcher.sendMessageAsUser(
        message.channelId!,
        `Failed to end poll: ${err.error ?? 'unknown'}`,
        message.id
      );
      return;
    }
    dispatcher.sendMessageAsUser(message.channelId!, 'Poll ended!', message.id);
  } catch (e) {
    console.error('Failed to call poll/end endpoint:', e);
    dispatcher.sendMessageAsUser(message.channelId!, 'Failed to end poll', message.id);
  }
}
