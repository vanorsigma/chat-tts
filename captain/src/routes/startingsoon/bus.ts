import { ReconnectingWebSocket } from '$lib/reconnectingWs';
import { PUBLIC_BUS_URL, PUBLIC_RECEIVER_URL } from '$env/static/public';
import type {
  SongStateMessage,
  SpamCompleteMessage,
  SongCompleteMessage
} from '$lib/songs/messages';

export function createBus() {
  const senderWs = new ReconnectingWebSocket(PUBLIC_BUS_URL);
  const receiverWs = new ReconnectingWebSocket(PUBLIC_RECEIVER_URL);

  function sendState(msg: SongStateMessage) {
    senderWs.send(JSON.stringify(msg));
  }

  function sendSpamComplete(msg: SpamCompleteMessage) {
    senderWs.send(JSON.stringify(msg));
  }

  function sendSongComplete(msg: SongCompleteMessage) {
    senderWs.send(JSON.stringify(msg));
  }

  return { senderWs, receiverWs, sendState, sendSpamComplete, sendSongComplete };
}
