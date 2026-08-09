import type { ChatViewerMilestoneInfo, UserNotice } from '@twurple/chat';
import type { OverlayDispatchers, OverlayViewerMilestoneObserver } from './dispatcher';
import { enqueueGambaSpin } from './gamba/queue';
import { STREAK_GAMBA_ITEMS } from './gamba/gamba';
import type { Commands } from './commands';
import { getOverlayConfig } from './constants';

export class WatchStreakTracker implements OverlayViewerMilestoneObserver {
  private dispatchers: OverlayDispatchers;
  private commands: Commands | null;

  constructor(dispatchers: OverlayDispatchers, commands: Commands | null = null) {
    this.dispatchers = dispatchers;
    this.commands = commands;
    dispatchers.addViewerMilestoneObserver(this);
  }

  onViewerMilestone(info: ChatViewerMilestoneInfo, notice: UserNotice): void {
    const streakLength = info.value ?? 0;
    const username = notice.userInfo.userName;
    const channelId = notice.channelId!;
    console.log(`${username} shared a watch streak of ${streakLength}.`);

    if (streakLength && !isNaN(streakLength))
      this.handleWatchStreak(username, channelId, streakLength);
  }

  handleWatchStreak(username: string, channelId: string, watchStreak: number) {
    const { streakInterval } = getOverlayConfig().watchStreakConfig;
    if (!streakInterval || watchStreak % streakInterval !== 0) return;

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
