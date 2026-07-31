export const ALL_COMMANDS = [
  '%poll',
  '%endpoll',
  '%prediction',
  '%endprediction',
  '%chicken',
  '%checkin',
  '%flashbang',
  '%blacksilence',
  '%points',
  '%givepoints',
  '%transfer',
  '%maxwell',
  '%median',
  '%mistake',
  '%si',
  '%showimage',
  '%pa',
  '%playsound',
  '%playaudio',
  '%buy',
  '%sell',
  '%stocks',
  '%endstream',
  '%gamba',
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
  '%refreshVoice',
  '%grayscale',
  '%resetcooldown',
  '%important',
  '%unimportant',
  '%check'
] as const;

export type ChatCommand = (typeof ALL_COMMANDS)[number];

export const COMMAND_SECTION: Record<ChatCommand, string> = {
  '%poll': 'poll',
  '%endpoll': 'poll',
  '%prediction': 'prediction',
  '%endprediction': 'prediction',
  '%chicken': 'checkIn',
  '%checkin': 'checkIn',
  '%flashbang': 'flashbang',
  '%blacksilence': 'blackSilence',
  '%points': 'economy',
  '%givepoints': 'economy',
  '%transfer': 'economy',
  '%maxwell': 'maxwell',
  '%median': 'economy',
  '%mistake': 'mistake',
  '%si': 'showImage',
  '%showimage': 'showImage',
  '%pa': 'playAudio',
  '%playsound': 'playAudio',
  '%playaudio': 'playAudio',
  '%buy': 'stockMarket',
  '%sell': 'stockMarket',
  '%stocks': 'stockMarket',
  '%endstream': 'endstream',
  '%gamba': 'stockMarket',
  '%selfthought': 'selfThought',
  '%goodnightkiss': 'goodNightKiss',
  '%settitle': 'setTitle',
  '%givekarma': 'karma',
  '%restart': 'restart',
  '%undress': 'karma',
  '%stars': 'karma',
  '%hearts': 'karma',
  '%bid': 'bid',
  '%endbid': 'bid',
  '%block': 'moderation',
  '%unblock': 'moderation',
  '%kill': 'moderation',
  '%rotate': 'distract',
  '%distract': 'distract',
  '%refreshVoice': 'voice',
  '%grayscale': 'grayscale',
  '%resetcooldown': 'moderation',
  '%important': 'important',
  '%unimportant': 'important',
  '%check': 'check'
};

export const REQUIRES_ARGS = new Set<ChatCommand>([
  '%poll',
  '%prediction',
  '%givepoints',
  '%transfer',
  '%si',
  '%showimage',
  '%pa',
  '%playsound',
  '%playaudio',
  '%buy',
  '%sell',
  '%gamba',
  '%selfthought',
  '%settitle',
  '%givekarma',
  '%block',
  '%unblock',
  '%kill',
  '%important',
  '%check'
]);

export const COMMAND_HELP: Partial<Record<ChatCommand, string>> = {
  '%poll': '%poll <title>;<durationSec>;<option1>;[option2;[option3;[option4;[option5]]]]',
  '%prediction': '%prediction <title>;<durationSec>;<option1>;<option2>',
  '%givepoints': '%givepoints <username> <amount>',
  '%transfer': '%transfer <username> <amount>',
  '%si': '%si <imageUrl>',
  '%showimage': '%showimage <imageUrl>',
  '%pa': '%pa <audioUrl>',
  '%playsound': '%playsound <audioUrl>',
  '%playaudio': '%playaudio <audioUrl>',
  '%buy': '%buy <symbol> <points> [overpay]',
  '%sell': '%sell <symbol> <shares>',
  '%gamba': '%gamba <amount>',
  '%selfthought': '%selfthought <message>',
  '%settitle': '%settitle <newTitle>',
  '%givekarma': '%givekarma <amount>',
  '%block': '%block <%command>',
  '%unblock': '%unblock <%command>',
  '%kill': '%kill <username>',
  '%resetcooldown': '%resetcooldown [username|all]',
  '%important': '%important <duration> (5m, 30s, 1h, 1m30s)',
  '%unimportant': '%unimportant',
  '%check': '%check <%command> [args...]',
  '%median': '%median'
};

// stronger unblockables, not even config can remove them
export const UNBLOCKABLE = new Set<ChatCommand>(['%important', '%unimportant']);

export function asChatCommand(rawStr: string): ChatCommand | null {
  const lowered = rawStr.toLowerCase();
  for (const cmd of ALL_COMMANDS) {
    if (cmd.toLowerCase() === lowered) return cmd;
  }
  const withPercent = `%${lowered}`;
  for (const cmd of ALL_COMMANDS) {
    if (cmd.toLowerCase() === withPercent) return cmd;
  }
  return null;
}
