import { isRemoteTTSMessage } from '../remoteTTSMessages';

export interface ChatTTSOrchestrator {
  cancel(): Promise<void>;
  setEnabled(enable: boolean): void;
}

export class RemoteChatTTSController {
  private socket: WebSocket;
  private parentController: ChatTTSOrchestrator;

  constructor(controller: ChatTTSOrchestrator, busUrl: string) {
    this.socket = new WebSocket(busUrl);
    this.socket.onopen = () => {
      console.log('connected to chat tts controller');
    };

    this.socket.onclose = () => {
      console.log('disconnected from chat tts controller');
    };

    this.socket.onmessage = (ev) => this.onMessage(ev.data);

    this.parentController = controller;
  }

  onMessage(message: string) {
    const data = JSON.parse(message);
    if (!isRemoteTTSMessage(data)) return;

    switch (data.command.type) {
      case 'cancel':
        this.parentController.cancel();
        break;
      case 'disable':
        this.parentController.setEnabled(false);
        setTimeout(() => {
          this.parentController.setEnabled(true);
        }, data.command.duration * 1000);
        break;
      default:
        console.error(`Forgot to implement ${data.command} in Remote TTS Controller`);
        break;
    }
  }
}
