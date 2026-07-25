import type { OverlaySubObserver } from './dispatcher';
import type { UserNotice, ChatSubInfo, ChatSubGiftInfo, ChatCommunitySubInfo } from '@twurple/chat';
import { setSubTier } from '$lib/api/subtiers';
import { enqueueGambaSpin } from './gamba/queue';
import type { OverlayDispatchers } from './dispatcher';
import { planToTier } from '$lib/twitch';
import { SUB_BITS_GAMBA_ITEMS } from './gamba/gamba';
import type { Commands } from './commands';

export class SubTracker implements OverlaySubObserver {
  private dispatchers: OverlayDispatchers;
  private commands: Commands | null;

  constructor(dispatchers: OverlayDispatchers, commands: Commands | null = null) {
    this.dispatchers = dispatchers;
    this.commands = commands;
    dispatchers.addSubObserver(this);
  }

  onSub(channel: string, user: string, subInfo: ChatSubInfo, msg: UserNotice): void {
    const tier = planToTier(subInfo.plan);
    if (tier > 0) {
      setSubTier(subInfo.userId, tier).catch(() => {});
    }

    const channelId = msg.channelId ?? channel;
    enqueueGambaSpin(
      {
        dispatcher: this.dispatchers,
        channelId,
        username: user,
        bet: 1000 * tier,
        commands: this.commands ?? undefined
      },
      tier,
      SUB_BITS_GAMBA_ITEMS
    );

    this.dispatchers.sendMessageAsUser(
      channelId,
      `@${user} subscribed at tier ${tier}, spinning the gamba wheel!`
    );
  }

  onResub(channel: string, user: string, subInfo: ChatSubInfo, msg: UserNotice): void {
    const tier = planToTier(subInfo.plan);
    if (tier > 0) {
      setSubTier(subInfo.userId, tier).catch(() => {});
    }

    const channelId = msg.channelId ?? channel;
    enqueueGambaSpin(
      {
        dispatcher: this.dispatchers,
        channelId,
        username: user,
        bet: 1000 * tier,
        commands: this.commands ?? undefined
      },
      tier,
      SUB_BITS_GAMBA_ITEMS
    );

    this.dispatchers.sendMessageAsUser(
      channelId,
      `@${user} resubscribed at tier ${tier}, spinning the gamba wheel!`
    );
  }

  onSubGift(
    channel: string,
    recipientUser: string,
    subInfo: ChatSubGiftInfo,
    msg: UserNotice
  ): void {
    const tier = planToTier(subInfo.plan);
    if (tier > 0) {
      setSubTier(recipientUser, tier).catch(() => {});
    }

    const channelId = msg.channelId ?? channel;

    enqueueGambaSpin(
      {
        dispatcher: this.dispatchers,
        channelId,
        username: recipientUser,
        bet: 1000 * tier,
        commands: this.commands ?? undefined
      },
      tier,
      SUB_BITS_GAMBA_ITEMS
    );

    this.dispatchers.sendMessageAsUser(
      channelId,
      `@${recipientUser} received a gift sub (tier ${tier}), spinning the gamba wheel!`
    );
  }

  onCommunitySub(
    _channel: string,
    _user: string,
    _subInfo: ChatCommunitySubInfo,
    _msg: UserNotice
  ): void {
    // Community sub is handled via individual onSubGift events per recipient
  }
}
