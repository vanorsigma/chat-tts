import type { ChatMessage } from '@twurple/chat';
import type { Controller } from './controller'; // type imports don't end up circular

export abstract class Command {
  abstract processCommandMessage(controller: Controller, message: ChatMessage): Promise<boolean>;
}

class RefreshVoice extends Command {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async processCommandMessage(controller: Controller, message: ChatMessage) {
    controller.voice.refreshUser(message.userInfo);
    controller.updateChatLog(`${message.userInfo.userName}'s voice was refreshed.`);
    return true;
  }
}

class Rotate extends Command {
  lastTimestamp: number = 0;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async processCommandMessage(controller: Controller, message: ChatMessage) {
    if (controller.trinketController === undefined && controller.trinketController === undefined) {
      return true;
    }

    if (
      this.lastTimestamp + (controller.config.distractConfig?.rotateCooldown ?? 0) * 1000 >
      Date.now()
    ) {
      controller.updateChatLog(
        `${message.userInfo.userName} tried to rotate, but it was under cooldown.`
      );
      return true;
    }
    this.lastTimestamp = Date.now();

    await controller.obsController?.rotateSourcesRandomly(
      controller.config.obsSettings?.rotationNames ?? []
    );
    await controller.trinketController?.sendRotate();

    controller.updateChatLog(`${message.userInfo.userName} rotated the screen.`);
    return true;
  }
}

class Distract extends Command {
  lastTimestamp: number = 0;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async processCommandMessage(controller: Controller, message: ChatMessage) {
    if (controller.trinketController === undefined) {
      return true;
    }

    if (
      this.lastTimestamp + (controller.config.distractConfig?.distractCooldown ?? 0) * 1000 >
      Date.now()
    ) {
      controller.updateChatLog(
        `${message.userInfo.userName} tried to send a distraction, but it was under cooldown.`
      );
      return true;
    }

    this.lastTimestamp = Date.now();
    await controller.trinketController.sendDistract();

    controller.updateChatLog(`${message.userInfo.userName} sent a distraction.`);
    return true;
  }
}

export const COMMANDS = new Map([
  ['refreshvoice', new RefreshVoice()],
  ['rotate', new Rotate()],
  ['distract', new Distract()]
]);

export const LEADER = '%';
