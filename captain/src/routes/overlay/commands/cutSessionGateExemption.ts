import type { ChatMessage } from '@twurple/chat';
import { cutStore } from '../stores';
import type { GateExemptionProvider } from './gate';
import type { ChatCommand } from './registry';

export class CutSessionGateExemption implements GateExemptionProvider {
  shouldBypassGate(commandIndicator: ChatCommand, _message: ChatMessage): boolean {
    return commandIndicator === '%cut' && cutStore.videoActive;
  }
}
