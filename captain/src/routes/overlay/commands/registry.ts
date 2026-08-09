import { COMMAND_DEFINITIONS } from './definitions';

export type ChatCommand = (typeof COMMAND_DEFINITIONS)[number]['names'][number];

export const ALL_COMMANDS: readonly ChatCommand[] = COMMAND_DEFINITIONS.flatMap((def) =>
  def.names
);

export const REQUIRES_ARGS: ReadonlySet<ChatCommand> = new Set(
  COMMAND_DEFINITIONS.flatMap((def) =>
    'requiresArgs' in def && def.requiresArgs ? def.names : []
  )
);

export const COMMAND_HELP: Partial<Record<ChatCommand, string>> = Object.fromEntries(
  COMMAND_DEFINITIONS.flatMap((def) =>
    'help' in def && def.help ? def.names.map((name) => [name, def.help!]) : []
  )
) as Partial<Record<ChatCommand, string>>;

// stronger unblockables, not even config can remove them
export const UNBLOCKABLE = new Set<ChatCommand>(['%important', '%unimportant']);

export function asChatCommand(rawStr: string): ChatCommand | null {
  const lowered = rawStr.toLowerCase();
  for (const def of COMMAND_DEFINITIONS) {
    for (const name of def.names) {
      if (name.toLowerCase() === lowered || name.toLowerCase() === `%${lowered}`) return name;
    }
  }
  return null;
}
