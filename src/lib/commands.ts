import type { Controller } from "./controller"; // type imports don't end up circular
import tmi from "tmi.js";

export abstract class Command {
  abstract processCommandMessage(controller: Controller, user: tmi.ChatUserstate, message: string): boolean;
}

class RefreshVoice extends Command {
  processCommandMessage(controller: Controller, user: tmi.ChatUserstate, _message: string) {
    controller.voice.refreshUser(user);
    controller.updateChatLog(`${user.username}'s voice was refreshed.`)
    return true;
  }
}

export const COMMANDS = new Map([
  ['refreshVoice', new RefreshVoice()]
]);

export const LEADER = '%';
