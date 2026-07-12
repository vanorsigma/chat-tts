export const ALL_COMMANDS = [
  '%poll',
  '%vote',
  '%chicken',
  '%checkin',
  '%flashbang',
  '%blacksilence',
  '%points',
  '%givepoints',
  '%transfer',
  '%maxwell',
  '%mistake',
  '%si',
  '%showimage',
  '%pa',
  '%playsound',
  '%playaudio',
  '%invest',
  '%uninvest',
  '%stock',
  '%closemarket',
  '%selfthought',
  '%goodnightkiss',
  '%settitle',
  '%givekarma',
  '%restart',
  '%undress',
  '%stars',
  '%hearts',
  '%bid',
  '%block',
  '%unblock',
  '%kill',
  '%rotate',
  '%distract',
  '%endbid',
  '%refreshVoice'
] as const;

export type ChatCommand = (typeof ALL_COMMANDS)[number];

function isChatCommand(rawStr: string): rawStr is ChatCommand {
  return (ALL_COMMANDS as readonly string[]).includes(rawStr);
}

export function asChatCommand(rawStr: string): ChatCommand | null {
  if (isChatCommand(rawStr)) return rawStr;
  if (isChatCommand(`%${rawStr}`)) return `%${rawStr}` as ChatCommand;
  return null;
}
