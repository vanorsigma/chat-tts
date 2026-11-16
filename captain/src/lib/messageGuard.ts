export interface MessageGuardInput {
  text: string;
  userName: string;
  isBot: boolean;
  ignorePrefix: string;
  ignoredUsers: string[];
}

const IRC_LINE_BREAK = /[\r\n]/;
const IRC_PROTOCOL_LINE = /(?:^|\s)(?:@\S+ )?:\S+!\S+@\S+ (?:PRIVMSG|WHISPER|NOTICE|USERNOTICE) #?\S+ :/;
const IRC_TAG_PREFIX = /^@(?:badge-info|badges|color|display-name|emotes|id|mod|room-id|subscriber|tmi-sent-ts|user-id|user-type)=/;

/**
 * Twitch never puts CR/LF in a chat message. A raw IRC line can end up in
 * `text` when a WebSocket chunk ends between the `\r` and `\n` of a line:
 * Twurple's line buffer then merges two IRC messages, and the next message's
 * tags/prefix become part of this message's trailing text.
 * Fix it by skipping the message outright.
 */
export function containsRawIrc(text: string): boolean {
  return IRC_LINE_BREAK.test(text) || IRC_PROTOCOL_LINE.test(text) || IRC_TAG_PREFIX.test(text);
}

export function shouldSkipMessage(input: MessageGuardInput): boolean {
  if (input.isBot) return true;
  if (input.ignoredUsers.includes(input.userName.toLowerCase())) return true;
  if (input.text.startsWith(input.ignorePrefix)) return true;
  if (input.text.startsWith('%')) return true;
  if (input.text.startsWith('~')) return true;
  if (containsRawIrc(input.text)) return true;
  return false;
}
