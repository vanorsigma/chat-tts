import type { ChatMessage } from '@twurple/chat';
import { PUBLIC_TARGET_CHANNEL_ID } from '$env/static/public';
import { SKIPPED_USERNAMES } from '$lib/messageGuard';
import type { OverlayDispatchers } from '../dispatcher';
import { computeCommandChance, rollSuccess, timeoutSecondsForFailChance } from './chance';
import type { ChatCommand } from './registry';

export interface GateExemptionProvider {
  shouldBypassGate(commandIndicator: ChatCommand, message: ChatMessage): boolean;
}

export class CommandGate {
  private exemptionProviders: GateExemptionProvider[] = [];

  addExemptionProvider(provider: GateExemptionProvider): void {
    if (!this.exemptionProviders.includes(provider)) {
      this.exemptionProviders.push(provider);
    }
  }

  removeExemptionProvider(provider: GateExemptionProvider): void {
    this.exemptionProviders = this.exemptionProviders.filter((candidate) => candidate !== provider);
  }

  async run(
    commandIndicator: ChatCommand,
    dispatcher: OverlayDispatchers,
    message: ChatMessage,
    bitsBonus: number,
    onAllow: () => void
  ): Promise<void> {
    const username = message.userInfo.userName;
    if (message.userInfo.isBroadcaster || SKIPPED_USERNAMES.has(username)) {
      console.log(`Gate command trapdoor for ${username}`);
      onAllow();
      return;
    }

    if (
      this.exemptionProviders.some((provider) =>
        provider.shouldBypassGate(commandIndicator, message)
      )
    ) {
      onAllow();
      return;
    }

    const channelId = message.channelId ?? PUBLIC_TARGET_CHANNEL_ID;
    const userId = message.userInfo.userId;

    let chance = 100;
    try {
      const result = await computeCommandChance(commandIndicator, userId, channelId, bitsBonus);
      chance = result.successChance;
      if (result.base !== result.successChance) {
        console.log(
          `${username} ${commandIndicator}: adjusted chance=${result.successChance}% (base=${result.base}%, bitsBonus=${bitsBonus}%)`
        );
      }
    } catch (e) {
      console.warn('chance computation failed, defaulting to 100%', e);
    }

    if (rollSuccess(chance)) {
      onAllow();
      return;
    }

    const failChance = 100 - Math.min(chance, 100);
    const timeoutSec = timeoutSecondsForFailChance(failChance);
    dispatcher.sendMessageAsUser(
      channelId,
      `@${username} fumbled ${commandIndicator} (${failChance}% fail chance) -> timeout ${timeoutSec}s`,
      message.id
    );
    try {
      await dispatcher.timeoutUser(
        channelId,
        userId,
        'command failed',
        timeoutSec,
        message.userInfo.isMod
      );
    } catch (e) {
      console.warn(`failed to timeout ${username}:`, e);
    }
  }
}
