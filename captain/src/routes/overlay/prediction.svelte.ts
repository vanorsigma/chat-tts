import { COMMAND_HELP } from './commands/registry';
import type { OverlayDispatchers } from './dispatcher';
import type { ChatMessage } from '@twurple/chat';

export interface PredictionOutcome {
  id?: string;
  name: string;
  channelPoints: number;
  voters: number;
  color?: string;
}

export interface Prediction {
  id?: string;
  title: string;
  outcomes: PredictionOutcome[] | undefined;
  status?: 'active' | 'locked' | 'resolved' | 'canceled';
  winningOutcomeId?: string | null;
  startDate?: string;
  endDate?: string;
}

function getPredictionParameters(
  message: string
): { title: string; autoLockAfter: number; outcomes: string[] } | null {
  const rest = message.replace('%prediction', '').trim();
  const splits = rest.split(';');
  if (splits.length < 4) return null;

  const title = splits[0];
  const autoLockAfter = Number(splits[1]);
  const outcomes = splits.slice(2).filter(Boolean);

  if (
    !title ||
    isNaN(autoLockAfter) ||
    autoLockAfter < 15 ||
    autoLockAfter > 1800 ||
    outcomes.length !== 2
  ) {
    return null;
  }
  if (outcomes.some((o) => o.length < 1 || o.length > 25)) return null;

  return { title, autoLockAfter, outcomes };
}

export async function predictionCommandHandler(
  dispatcher: OverlayDispatchers,
  message: ChatMessage
): Promise<void> {
  if (!(message.userInfo.isMod || message.userInfo.isVip || message.userInfo.isBroadcaster)) {
    return;
  }

  const params = getPredictionParameters(message.text);
  if (!params) {
    dispatcher.sendMessageAsUser(
      message.channelId!,
      COMMAND_HELP['%prediction'] ?? 'Invalid format',
      message.id
    );
    return;
  }

  try {
    const res = await fetch('/api/twitch/prediction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params)
    });
    if (!res.ok) {
      const err = await res.json();
      dispatcher.sendMessageAsUser(
        message.channelId!,
        `Failed to create prediction: ${err.error ?? 'unknown error'}`,
        message.id
      );
      return;
    }
    dispatcher.sendMessageAsUser(message.channelId!, 'Prediction created!', message.id);
  } catch (e) {
    console.error('Failed to call prediction endpoint:', e);
    dispatcher.sendMessageAsUser(message.channelId!, 'Prediction creation failed', message.id);
  }
}

export async function endPredictionCommandHandler(
  dispatcher: OverlayDispatchers,
  message: ChatMessage
): Promise<void> {
  if (!(message.userInfo.isMod || message.userInfo.isVip || message.userInfo.isBroadcaster)) {
    return;
  }

  try {
    const res = await fetch('/api/twitch/prediction/lock', { method: 'POST' });
    if (!res.ok) {
      const err = await res.json();
      dispatcher.sendMessageAsUser(
        message.channelId!,
        `Failed to lock prediction: ${err.error ?? 'unknown'}`,
        message.id
      );
      return;
    }
    dispatcher.sendMessageAsUser(message.channelId!, 'Prediction locked!', message.id);
  } catch (e) {
    console.error('Failed to call prediction/lock endpoint:', e);
    dispatcher.sendMessageAsUser(message.channelId!, 'Failed to lock prediction', message.id);
  }
}
