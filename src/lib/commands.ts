import type { Controller } from "./controller"; // type imports don't end up circular
import tmi from "tmi.js";

export abstract class Command {
  abstract processCommandMessage(controller: Controller, user: tmi.ChatUserstate, message: string): Promise<boolean>;
}

class RefreshVoice extends Command {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async processCommandMessage(controller: Controller, user: tmi.ChatUserstate, _message: string) {
    controller.voice.refreshUser(user);
    controller.updateChatLog(`${user.username}'s voice was refreshed.`)
    return true;
  }
}

class Rotate extends Command {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async processCommandMessage(controller: Controller, user: tmi.ChatUserstate, _message: string) {
    if (controller.obsController === undefined) {
      return true;
    }

    await controller.obsController.rotateSourcesRandomly(controller.config.obsSettings?.rotationNames ?? []);
    await controller.trinketController?.sendRotate();

    controller.updateChatLog(`${user.username} rotated the screen.`)
    return true;
  }
}

class Distract extends Command {
  lastTimestamp: number = 0;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async processCommandMessage(controller: Controller, user: tmi.ChatUserstate, _message: string) {
    if (controller.trinketController === undefined) {
      return true;
    }

    if (this.lastTimestamp + (controller.config.distractConfig?.cooldown ?? 0) * 1000 > Date.now()) {
      controller.updateChatLog(`${user.username} tried to send a distraction, but it was under cooldown.`)
      return true;
    }

    this.lastTimestamp = Date.now();
    await controller.trinketController.sendDistract();

    controller.updateChatLog(`${user.username} sent a distraction.`)
    return true;
  }
}

export const COMMANDS = new Map([
  ['refreshvoice', new RefreshVoice()],
  ['rotate', new Rotate()],
  ['distract', new Distract()]
]);

export const LEADER = '%';
