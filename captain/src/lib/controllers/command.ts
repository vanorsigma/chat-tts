import { COMMANDS, LEADER, type Command } from '../commands';

export class CommandController {
  getCommand(msg: string): Command | null {
    for (const key of COMMANDS.keys()) {
      if (msg.toLowerCase() === LEADER + key) {
        return COMMANDS.get(key)!;
      }
    }

    return null;
  }
}
