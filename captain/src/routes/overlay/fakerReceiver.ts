import { createFakeMessage } from '$lib/bus/fakeMessage';
import { isFakerMessage } from '$lib/bus/messages';
import type { ChatMessage } from '@twurple/chat';

export function installFakerReceiver(
  ws: WebSocket,
  channelId: string,
  onFake: (msg: ChatMessage) => void
) {
  ws.addEventListener('message', (event) => {
    let data: unknown;
    try {
      data = JSON.parse(event.data);
    } catch {
      return;
    }
    if (!isFakerMessage(data)) return;

    console.log(
      `Faker message received: "${data.text}" from ${data.displayName ?? 'Faker'}`
    );

    const fake = createFakeMessage(data.text, data.displayName, channelId);
    onFake(fake);
  });
}
