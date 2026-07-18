import type { OverlaySubObserver } from './dispatcher';
import type { UserNotice, ChatSubInfo, ChatSubGiftInfo, ChatCommunitySubInfo } from '@twurple/chat';
import { setSubTier } from '$lib/api/subtiers';
import { enqueueGambaSpin } from './gamba/queue';
import type { OverlayDispatchers } from './dispatcher';
import { planToTier } from '$lib/twitch';

export class SubTracker implements OverlaySubObserver {
  private dispatchers: OverlayDispatchers;

  constructor(dispatchers: OverlayDispatchers) {
    this.dispatchers = dispatchers;
    dispatchers.addSubObserver(this);
  }

  onSub(_channel: string, _user: string, subInfo: ChatSubInfo, _msg: UserNotice): void {
    const tier = planToTier(subInfo.plan);
    if (tier > 0) {
      setSubTier(subInfo.userId, tier).catch(() => {});
    }
  }

  onResub(_channel: string, _user: string, subInfo: ChatSubInfo, _msg: UserNotice): void {
    const tier = planToTier(subInfo.plan);
    if (tier > 0) {
      setSubTier(subInfo.userId, tier).catch(() => {});
    }
  }

  onSubGift(channel: string, recipientUser: string, subInfo: ChatSubGiftInfo, msg: UserNotice): void {
    const tier = planToTier(subInfo.plan);
    if (tier > 0) {
      setSubTier(recipientUser, tier).catch(() => {});
    }

    const channelId = msg.channelId ?? channel;

    enqueueGambaSpin({
      dispatcher: this.dispatchers,
      channelId,
      username: recipientUser
    });

    this.dispatchers.sendMessageAsUser(
      channelId,
      `@${recipientUser} received a gift sub, spinning the gamba wheel!`
    );
  }

  onCommunitySub(_channel: string, _user: string, _subInfo: ChatCommunitySubInfo, _msg: UserNotice): void {
    // Community sub is handled via individual onSubGift events per recipient
  }
}
