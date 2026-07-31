import type { ChatMessage } from '@twurple/chat';
import type { OverlayDispatchers, OverlayObserver } from './dispatcher';
import { requireUsername } from './commands/handlers/shared';
import { enqueueGambaSpin } from './gamba/queue';
import { STREAK_GAMBA_ITEMS } from './gamba/gamba';
import type { Commands } from './commands';
import { getOverlayConfig } from './constants';

export class WatchStreakTracker implements OverlayObserver {
  private dispatchers: OverlayDispatchers;
  private commands: Commands | null;

  constructor(dispatchers: OverlayDispatchers, commands: Commands | null = null) {
    this.dispatchers = dispatchers;
    this.commands = commands;
    dispatchers.addObserver(this);
  }

  onMessage(message: ChatMessage): void {
    const msgId = message.tags.get('msg-id');
    const category = message.tags.get('msg-param-category');

    const username = requireUsername(message);
    if (!username) return;

    if (msgId === 'viewermilestone' && category === 'watch-streak') {
      const streakLength = Number.parseInt(message.tags.get('msg-param-value') ?? '0');
      console.log(`${username} shared a watch streak of ${streakLength}.`);

      if (streakLength && !isNaN(streakLength))
        this.handleWatchStreak(message, streakLength);
    }
  }

  handleWatchStreak(message: ChatMessage, watchStreak: number) {
    const { streakInterval } = getOverlayConfig().watchStreak;
    if (!streakInterval || watchStreak % streakInterval !== 0) return;

    const username = requireUsername(message);
    if (!username) return;

    const channelId = message.channelId;
    if (!channelId) return;

    const multiplier = watchStreak;
    const bet = watchStreak * 100;

    enqueueGambaSpin(
      {
        dispatcher: this.dispatchers,
        channelId,
        username,
        bet,
        commands: this.commands ?? undefined
      },
      multiplier,
      STREAK_GAMBA_ITEMS
    );

    this.dispatchers.sendMessageAsUser(
      channelId,
      `@${username} shared a watch streak of ${watchStreak}, spinning the gamba wheel!`
    );
  }
}
