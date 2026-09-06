import type { OverlayDispatchers, OverlayObserver } from '../dispatcher';
import {
  asChatCommand,
  COMMAND_HELP,
  REQUIRES_ARGS,
  type ChatCommand
} from './registry';
import { definitionFor } from './definitions';
import { COMMAND_HANDLERS } from './dispatch';
import { PUBLIC_TARGET_CHANNEL_ID } from '$env/static/public';
import type { ChatMessage } from '@twurple/chat';
import { getOverlayConfig, isSectionDisabled } from '../constants';
import { triggerBlackSilenceEffects } from './handlers/redeems';
import { addBitBoost, flushBitBoosts } from '$lib/api/bits';
import { karmaStore, importantStore } from '../stores';
import { enqueueGambaSpin } from '../gamba/queue';
import { SUB_BITS_GAMBA_ITEMS } from '../gamba/gamba';
import { parseDuration } from '$lib/duration';
import { CommandGate, type GateExemptionProvider } from './gate';

export class Commands implements OverlayObserver {
  dispatchers?: OverlayDispatchers = undefined;
  private gate = new CommandGate();
  cooldowns: Map<string, number> = new Map();
  gambaUserCooldowns: Map<string, number> = new Map();
  buyUserCooldowns: Map<string, number> = new Map();
  blacklist: Array<ChatCommand> = [];
  bitsBoosts: Map<string, number> = new Map();

  importantActive = false;
  vipImportantUsedThisStream = false;
  private importantExpiry = 0;
  private importantTicker: ReturnType<typeof setInterval> | null = null;

  busWs?: WebSocket = undefined;

  constructor(dispatchers?: OverlayDispatchers) {
    this.dispatchers = dispatchers;
  }

  setBusSocket(ws: WebSocket) {
    if (this.busWs) {
      this.busWs.close();
    }
    this.busWs = ws;
  }

  addGateExemptionProvider(provider: GateExemptionProvider): void {
    this.gate.addExemptionProvider(provider);
  }

  removeGateExemptionProvider(provider: GateExemptionProvider): void {
    this.gate.removeExemptionProvider(provider);
  }

  callOnlyIfPastCooldown(
    commandKey: string,
    dispatcher: OverlayDispatchers,
    message: ChatMessage,
    callback: () => void
  ) {
    const now = Date.now();
    const key = commandKey.startsWith('%') ? commandKey.slice(1) : commandKey;
    const lastUsed = this.cooldowns.get(key) ?? 0;
    const cooldown =
      (getOverlayConfig().commandCooldownsConfig as unknown as Record<
        string,
        number | undefined
      >)[key] ?? 10000;
    if (message.userInfo.isBroadcaster || now >= lastUsed + cooldown) {
      callback();
      this.cooldowns.set(key, now);
    } else {
      dispatcher.sendMessageAsUser(PUBLIC_TARGET_CHANNEL_ID, 'command under cooldown', message.id);
    }
  }

  onMessage(message: ChatMessage): void {
    if (!this.dispatchers) {
      throw new Error('No dispatcher');
    }

    const dispatcher = this.dispatchers;
    const username = message.userInfo.userName;
    if (!username) return;

    if (message.bits > 0 && username) {
      void this.handleBits(message, username);
    }

    const firstSplit = message.text.split(' ')[0];
    if (!firstSplit.startsWith('%')) return;

    const commandIndicator = asChatCommand(firstSplit);
    if (!commandIndicator) {
      dispatcher.sendMessageAsUser(message.channelId!, 'Not a valid command.', message.id);
      return;
    }

    if (this.importantActive && commandIndicator !== '%unimportant') {
      dispatcher.sendMessageAsUser(
        message.channelId!,
        'Important mode is active; commands are paused.',
        message.id
      );
      return;
    }

    if (this.blacklist.includes(commandIndicator)) {
      dispatcher.sendMessageAsUser(
        message.channelId!,
        'This command has been blocked!',
        message.id
      );
      return;
    }

    const rest = message.text.slice(firstSplit.length).trim();
    if (REQUIRES_ARGS.has(commandIndicator) && !rest) {
      dispatcher.sendMessageAsUser(
        message.channelId!,
        COMMAND_HELP[commandIndicator] ?? 'invalid syntax',
        message.id
      );
      return;
    }

    const definition = definitionFor(commandIndicator);
    const sectionKey = definition?.section?.key;
    if (sectionKey && isSectionDisabled(sectionKey)) {
      dispatcher.sendMessageAsUser(
        message.channelId!,
        `vanor 1984'd ${commandIndicator}, call him stinky!`,
        message.id
      );
      return;
    }

    if (definition?.gateMode === 'overlay') {
      void this.gate.run(
        commandIndicator,
        dispatcher,
        message,
        this.getUserBitsBoost(username),
        () => this.dispatchCommand(commandIndicator, dispatcher, message)
      );
      return;
    }

    this.dispatchCommand(commandIndicator, dispatcher, message);
  }

  private async handleBits(message: ChatMessage, username: string) {
    const bits = message.bits;
    karmaStore.updateKarma(bits * 10, 'Bits', false);
    const current = this.bitsBoosts.get(username) ?? 0;
    this.bitsBoosts.set(username, current + bits);
    console.log(`${username} cheered ${bits} bits (total boost: ${current + bits})`);
    await addBitBoost(username, bits);

    const multiplier = bits / 100;
    enqueueGambaSpin(
      {
        dispatcher: this.dispatchers!,
        channelId: message.channelId!,
        username,
        userId: message.userInfo.userId,
        isMod: message.userInfo.isMod,
        bet: bits,
        commands: this
      },
      multiplier,
      SUB_BITS_GAMBA_ITEMS
    );

    this.dispatchers!.sendMessageAsUser(
      message.channelId!,
      `@${username} cheered ${bits} bits, spinning the gamba wheel!`,
      message.id
    );
  }

  getUserBitsBoost(username: string): number {
    return this.bitsBoosts.get(username) ?? 0;
  }

  addUserBitBoost(username: string, bits: number): void {
    const current = this.bitsBoosts.get(username) ?? 0;
    this.bitsBoosts.set(username, current + bits);
  }

  private dispatchCommand(
    commandIndicator: ChatCommand,
    dispatcher: OverlayDispatchers,
    message: ChatMessage
  ) {
    const definition = definitionFor(commandIndicator);
    const runner = COMMAND_HANDLERS[commandIndicator];
    if (!definition || !runner) return;

    const sectionConfig = definition.section
      ? (getOverlayConfig() as unknown as Record<string, unknown>)[definition.section.key]
      : undefined;

    if (definition.needsBus && !this.busWs) {
      dispatcher.sendMessageAsUser(message.channelId!, `tell vanor he's tupid `, message.id);
      return;
    }

    const run = () => runner(this, dispatcher, message, sectionConfig);
    if (definition.cooldown && !definition.manualCooldown) {
      this.callOnlyIfPastCooldown(commandIndicator, dispatcher, message, run);
    } else {
      void run();
    }
  }

  importantHandler(dispatcher: OverlayDispatchers, message: ChatMessage) {
    const u = message.userInfo;
    const isMod = u.isBroadcaster || u.isMod;
    if (!isMod && !u.isVip) {
      dispatcher.sendMessageAsUser(
        message.channelId!,
        '%important is for VIPs (once/stream) or mods/broadcaster.',
        message.id
      );
      return;
    }
    if (this.importantActive) {
      dispatcher.sendMessageAsUser(
        message.channelId!,
        'Important mode is already active.',
        message.id
      );
      return;
    }
    const arg = message.text.split(' ').slice(1).join(' ').trim();
    const dur = parseDuration(arg);
    if (!dur) {
      dispatcher.sendMessageAsUser(
        message.channelId!,
        COMMAND_HELP['%important'] ?? 'invalid syntax',
        message.id
      );
      return;
    }
    if (!isMod) this.vipImportantUsedThisStream = true;
    this.importantActive = true;
    this.importantExpiry = Date.now() + dur * 1000;
    importantStore.activate(dur);
    if (this.busWs) triggerBlackSilenceEffects(this.busWs);
    this.busWs?.send(
      JSON.stringify({
        type: 'control',
        op: 'important',
        importantActive: true,
        importantDurationSec: dur
      })
    );
    if (this.importantTicker) clearInterval(this.importantTicker);
    this.importantTicker = setInterval(() => {
      importantStore.tick(Date.now());
      if (Date.now() >= this.importantExpiry)
        this.endImportant(dispatcher, message.channelId!, message.id);
    }, 100);
    dispatcher.sendMessageAsUser(
      message.channelId!,
      `Important mode engaged for ${dur}s by ${u.userName}.`,
      message.id
    );
  }

  unimportantHandler(dispatcher: OverlayDispatchers, message: ChatMessage) {
    const u = message.userInfo;
    if (!(u.isBroadcaster || u.isMod)) {
      dispatcher.sendMessageAsUser(
        message.channelId!,
        '%unimportant is for mods/broadcaster only.',
        message.id
      );
      return;
    }
    if (!this.importantActive) {
      dispatcher.sendMessageAsUser(message.channelId!, 'Important mode is not active.', message.id);
      return;
    }
    this.endImportant(dispatcher, message.channelId!, message.id);
  }

  endImportant(dispatcher: OverlayDispatchers, channelId: string, replyTo?: string) {
    if (this.importantTicker) {
      clearInterval(this.importantTicker);
      this.importantTicker = null;
    }
    this.importantActive = false;
    this.importantExpiry = 0;
    importantStore.deactivate();
    this.busWs?.send(JSON.stringify({ type: 'control', op: 'important', importantActive: false }));
    dispatcher.sendMessageAsUser(channelId, 'Important mode ended.', replyTo);
  }

  async flushBits(dispatcher: OverlayDispatchers, message: ChatMessage) {
    try {
      await flushBitBoosts();
    } catch (e) {
      console.warn('Failed to flush bit boosts:', e);
    }
    this.bitsBoosts.clear();
    dispatcher.sendMessageAsUser(
      message.channelId!,
      'all bit boosts flushed for the stream',
      message.id
    );
  }
}
