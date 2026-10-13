export interface MessageGuardInput {
  text: string;
  userName: string;
  isBot: boolean;
  ignorePrefix: string;
  ignoredUsers: string[];
}

export function shouldSkipMessage(input: MessageGuardInput): boolean {
  if (input.isBot) return true;
  if (input.ignoredUsers.includes(input.userName.toLowerCase())) return true;
  if (input.text.startsWith(input.ignorePrefix)) return true;
  if (input.text.startsWith('%')) return true;
  if (input.text.startsWith('~')) return true;
  return false;
}
