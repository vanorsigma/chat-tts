export const SKIPPED_USERNAMES = new Set(['vanorgamma', 'streamelements']);

export interface MessageGuardInput {
  text: string;
  userName: string;
  isBot: boolean;
  ignorePrefix: string;
}

export function shouldSkipMessage(input: MessageGuardInput): boolean {
  if (input.isBot) return true;
  if (SKIPPED_USERNAMES.has(input.userName.toLowerCase())) return true;
  if (input.text.startsWith(input.ignorePrefix)) return true;
  if (input.text.startsWith('%')) return true;
  if (input.text.startsWith('~')) return true;
  return false;
}
