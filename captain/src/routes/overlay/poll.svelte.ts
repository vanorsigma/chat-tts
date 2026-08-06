import type { OverlayDispatchers } from './dispatcher';
import type { ChatMessage } from '@twurple/chat';

const WHITELISTED_POLL_USERS = ['vanorgamma'];

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

type PollParameters =
  | { ok: true; title: string; duration: number; choices: string[] }
  | { ok: false; error: string };

function getPollParameters(message: string): PollParameters {
  const rest = message.replace(/^%poll/i, '').trim();
  const splits = rest.split(';');
  if (splits.length < 3) {
    return { ok: false, error: 'A poll needs a title, duration, and at least 2 choices' };
  }

  const title = splits[0];
  const duration = Number(splits[1]);
  const choices = splits.slice(2).filter(Boolean);

  console.debug('Raw poll parameters: ', {
    title,
    duration,
    choices
  });

  if (
    !title ||
    title.length > 60 ||
    isNaN(duration) ||
    duration < 15 ||
    duration > 1800 ||
    choices.length < 2 ||
    choices.length > 5
  ) {
    if (!title) return { ok: false, error: 'Poll title is required' };
    if (title.length > 60) {
      return { ok: false, error: `Poll title is ${title.length} characters; maximum is 60` };
    }
    if (isNaN(duration)) {
      return { ok: false, error: `Duration must be a number, got "${splits[1]}"` };
    }
    if (duration < 15 || duration > 1800) {
      return { ok: false, error: 'Duration must be between 15 and 1800 seconds' };
    }
    if (choices.length < 2) return { ok: false, error: 'A poll needs at least 2 choices' };
    return { ok: false, error: 'A poll can have at most 5 choices' };
  }

  const invalidChoice = choices.findIndex((choice) => choice.length < 1 || choice.length > 25);
  if (invalidChoice !== -1) {
    const choice = choices[invalidChoice];
    return {
      ok: false,
      error: `Choice ${invalidChoice + 1} is ${choice.length} characters; maximum is 25: ${choice}`
    };
  }

  return { ok: true, title, duration, choices };
}

export async function pollCommandHandler(
  dispatcher: OverlayDispatchers,
  message: ChatMessage
): Promise<void> {
  if (
    !(
      message.userInfo.isMod ||
      message.userInfo.isVip ||
      message.userInfo.isBroadcaster ||
      WHITELISTED_POLL_USERS.includes(message.userInfo.userName)
    )
  ) {
    console.log(`${message.userInfo.userName} is not an approved user of %poll, skipping...`);
    return;
  }

  const params = getPollParameters(message.text);
  if (!params.ok) {
    dispatcher.sendMessageAsUser(message.channelId!, params.error, message.id);
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
