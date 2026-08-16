import type { ChatMessage } from '@twurple/chat';
import type { Controller } from './controllers';

export abstract class Command {
  abstract processCommandMessage(controller: Controller, message: ChatMessage): Promise<boolean>;
}

export class RefreshVoice extends Command {
  async processCommandMessage(controller: Controller, message: ChatMessage) {
    controller.voice?.refreshUser(message.userInfo);
    console.log(`${message.userInfo.userName}'s voice was refreshed.`);
    return true;
  }
}

export class Distract extends Command {
  lastTimestamp: number = 0;

  async processCommandMessage(controller: Controller, message: ChatMessage) {
    if (controller.trinketController === undefined) {
      return true;
    }

    if (
      this.lastTimestamp + (controller.config.distractConfig?.distractCooldown ?? 0) * 1000 >
      Date.now()
    ) {
      console.log(
        `${message.userInfo.userName} tried to send a distraction, but it was under cooldown.`
      );
      return true;
    }

    this.lastTimestamp = Date.now();
    await controller.trinketController.sendDistract();

    console.log(`${message.userInfo.userName} sent a distraction.`);
    return true;
  }
}

export class Unimportant extends Command {
  async processCommandMessage(controller: Controller, message: ChatMessage) {
    if (!(message.userInfo.isMod || message.userInfo.isBroadcaster)) {
      console.log(`${message.userInfo.userName} tried %unimportant, not mod/broadcaster.`);
      return true;
    }
    controller.setImportantBlocked(false);
    controller.setEnabled(true);
    controller.trinketController?.enable(false);
    controller.broadcastImportant(false);
    console.log(`%unimportant by ${message.userInfo.userName} — important mode ended.`);
    return true;
  }
}

export const COMMANDS = new Map([
  ['refreshvoice', new RefreshVoice()],
  ['distract', new Distract()],
  ['unimportant', new Unimportant()]
]);

export const LEADER = '%';
