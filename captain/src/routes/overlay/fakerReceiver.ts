import { createFakeMessage } from '$lib/bus/fakeMessage';
import { isFakerMessage, isFakerSubMessage, isFakerBitsMessage } from '$lib/bus/messages';
import type { ChatMessage } from '@twurple/chat';
import { enqueueGambaSpin } from './gamba/queue';
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
      const fake = createFakeMessage(data.text, data.displayName, channelId);
      onFake(fake);
      return;
    }

    if (isFakerSubMessage(data)) {
      const name = data.displayName?.trim() || 'Faker';
      console.log(`Faker sub received: ${name} tier ${data.tier}`);

      const dispatcher = getDispatchers();
      if (!dispatcher) return;

      const ctx: GambaContext = { dispatcher, channelId, username: name };
      enqueueGambaSpin(ctx);

      dispatcher.sendMessageAsUser(
        channelId,
        `@${name} received a fake gift sub, spinning the gamba wheel!`
      );
      return;
    }

    if (isFakerBitsMessage(data)) {
      const name = data.displayName?.trim() || 'Faker';
      const commands = getCommands();
      const current = commands?.getUserBitsBoost(name) ?? 0;
      console.log(`Faker bits received: ${name} amount ${data.amount} (total boost: ${current + data.amount})`);

      karmaStore.updateKarma(data.amount * 10, 'Bits', false);

      if (commands) {
        commands.addUserBitBoost(name, data.amount);
      }

      const dispatcher = getDispatchers();
      if (!dispatcher) return;

      const ctx: GambaContext = { dispatcher, channelId, username: name };
      enqueueGambaSpin(ctx);

      dispatcher.sendMessageAsUser(
        channelId,
        `@${name} cheered ${data.amount} bits, spinning the gamba wheel!`
      );
    }
  });
}
