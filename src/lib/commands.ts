import type { Controller } from "./controller"; // type imports don't end up circular
import tmi from "tmi.js";

export abstract class Command {
  abstract processCommandMessage(controller: Controller, user: tmi.ChatUserstate, message: string): boolean;
}

class RefreshVoice extends Command {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  processCommandMessage(controller: Controller, user: tmi.ChatUserstate, _message: string) {
    controller.voice.refreshUser(user);
    controller.updateChatLog(`${user.username}'s voice was refreshed.`)
    return true;
  }
}

class Rotate extends Command {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  processCommandMessage(controller: Controller, user: tmi.ChatUserstate, _message: string) {
    if (controller.obsController === undefined) {
      return true;
    }

    controller.obsController?.rotateMainMonitorSceneBy(1.0);
    controller.updateChatLog(`${user.username} rotated the screen.`)
    return true;
  }
}

export const COMMANDS = new Map([
  ['refreshvoice', new RefreshVoice()],
  ['rotate', new Rotate()],
]);

export const LEADER = '%';
