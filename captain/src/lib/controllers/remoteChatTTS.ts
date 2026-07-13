import { isRemoteTTSMessage, type RemoteTTSMessages } from '../remoteTTSMessages';

export interface ChatTTSOrchestrator {
  cancel(): Promise<void>;
  setEnabled(enable: boolean): void;
}

export class RemoteChatTTSController {
  private parentController: ChatTTSOrchestrator;

  constructor(controller: ChatTTSOrchestrator) {
    this.parentController = controller;
  }

  handleMessage(data: RemoteTTSMessages) {
    switch (data.command.type) {
      case 'cancel':
        console.log('Remote TTS cancel requested.');
        this.parentController.cancel();
        break;
      case 'disable':
        console.log(`Remote TTS disabling for ${data.command.duration} seconds.`);
        this.parentController.setEnabled(false);
        setTimeout(() => {
          console.log('Remote TTS re-enabled.');
          this.parentController.setEnabled(true);
        }, data.command.duration * 1000);
        break;
      default:
        console.error(`Forgot to implement ${data.command} in Remote TTS Controller`);
        break;
    }
  }
}
