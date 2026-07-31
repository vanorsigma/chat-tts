import { createFakeMessage } from '$lib/bus/fakeMessage';
import { isFakerMessage, isFakerSubMessage, isFakerBitsMessage, isFakerWatchStreakMessage } from '$lib/bus/messages';
import type { ChatMessage } from '@twurple/chat';
import { enqueueGambaSpin } from './gamba/queue';
import { SUB_BITS_GAMBA_ITEMS } from './gamba/gamba';
import type { GambaContext } from './gamba/gamba';
import type { OverlayDispatchers } from './dispatcher';
import type { Commands } from './commands';
import { karmaStore } from './stores';

export function installFakerReceiver(
  ws: WebSocket,
  channelId: string,
  getDispatchers: () => OverlayDispatchers | null,
  getCommands: () => Commands | null,
  onFake: (msg: ChatMessage) => void
) {
  ws.addEventListener('message', (event) => {
    let data: unknown;
    try {
      data = JSON.parse(event.data);
    } catch {
      return;
    }

    if (isFakerMessage(data)) {
      console.log(`Faker message received: "${data.text}" from ${data.displayName ?? 'Faker'}`);
      const fake = createFakeMessage(data.text, data.displayName, channelId, data.userId);
      onFake(fake);
      return;
    }

    if (isFakerSubMessage(data)) {
      const name = data.displayName?.trim() || 'Faker';
      const tier = data.tier ?? 1;
      console.log(`Faker sub received: ${name} tier ${tier}`);

      const dispatcher = getDispatchers();
      if (!dispatcher) return;

      const commands = getCommands();
      const ctx: GambaContext = {
        dispatcher,
        channelId,
        username: name,
        bet: 1000 * tier,
        commands: commands ?? undefined
      };
      enqueueGambaSpin(ctx, tier, SUB_BITS_GAMBA_ITEMS);

      dispatcher.sendMessageAsUser(
        channelId,
        `@${name} received a fake gift sub (tier ${tier}), spinning the gamba wheel!`
      );
      return;
    }

    if (isFakerBitsMessage(data)) {
      const name = data.displayName?.trim() || 'Faker';
      const amount = data.amount;
      const commands = getCommands();
      const current = commands?.getUserBitsBoost(name) ?? 0;
      console.log(
        `Faker bits received: ${name} amount ${amount} (total boost: ${current + amount})`
      );

      karmaStore.updateKarma(amount * 10, 'Bits', false);

      if (commands) {
        commands.addUserBitBoost(name, amount);
      }

      const dispatcher = getDispatchers();
      if (!dispatcher) return;

      const multiplier = amount / 100;
      const ctx: GambaContext = {
        dispatcher,
        channelId,
        username: name,
        bet: amount,
        commands: commands ?? undefined
      };
      enqueueGambaSpin(ctx, multiplier, SUB_BITS_GAMBA_ITEMS);

      dispatcher.sendMessageAsUser(
        channelId,
        `@${name} cheered ${amount} bits, spinning the gamba wheel!`
      );
    }

    if (isFakerWatchStreakMessage(data)) {
      const name = data.displayName?.trim() || 'Faker';
      const streak = data.streak;
      console.log(`Faker watch streak received: ${name} streak ${streak}`);

      const tags = new Map<string, string>();
      tags.set('msg-id', 'viewermilestone');
      tags.set('msg-param-category', 'watch-streak');
      tags.set('msg-param-value', String(streak));
      const fake = createFakeMessage('', name, channelId, undefined, tags);

      const dispatcher = getDispatchers();
      if (!dispatcher) return;
      dispatcher.dispatchMessage(fake);
    }
  });
}
