import type { ChatUser } from '@twurple/chat';
import type { ChatCommand } from './commands/registry';
import { getOverlayConfig } from './constants';

function commandKey(command: ChatCommand): string {
  return command.startsWith('%') ? command.slice(1) : command;
}

function normalizeUsername(username: string): string {
  return username.trim().replace(/^@/, '').toLowerCase();
}

export class CommandCooldowns {
  private globalLastUsedMap = new Map<string, number>();
  private userLastUsedMap = new Map<string, Map<string, number>>();

  private globalCooldownMs(command: ChatCommand): number {
    const config = getOverlayConfig().commandCooldownsConfig;
    const key = commandKey(command);
    return key in config ? (config[key as keyof typeof config] ?? 0) : 0;
  }

  private userCooldownMs(command: ChatCommand): number {
    const config = getOverlayConfig().userCommandCooldownsConfig;
    const key = commandKey(command);
    const value = key in config ? config[key as keyof typeof config] : undefined;
    return typeof value === 'number' ? value : 0;
  }

  private isBypassUser(user: ChatUser): boolean {
    if (user.isBroadcaster) return true;
    const normalized = normalizeUsername(user.userName);
    return getOverlayConfig().userCommandCooldownsConfig.bypassUsers.some(
      (candidate) => normalizeUsername(candidate) === normalized
    );
  }

  globalRemainingMs(command: ChatCommand, user: ChatUser, fromTime: number = Date.now()): number {
    if (this.isBypassUser(user)) return 0;
    const cooldownMs = this.globalCooldownMs(command);
    if (cooldownMs <= 0) return 0;
    const lastUsed = this.globalLastUsedMap.get(commandKey(command)) ?? 0;
    return Math.max(0, lastUsed + cooldownMs - fromTime);
  }

  userRemainingMs(command: ChatCommand, user: ChatUser, fromTime: number = Date.now()): number {
    if (this.isBypassUser(user)) return 0;
    const cooldownMs = this.userCooldownMs(command);
    if (cooldownMs <= 0) return 0;
    const lastUsed =
      this.userLastUsedMap.get(commandKey(command))?.get(normalizeUsername(user.userName)) ?? 0;
    return Math.max(0, lastUsed + cooldownMs - fromTime);
  }

  isOnGlobalCooldown(command: ChatCommand, user: ChatUser, fromTime?: number): boolean {
    return this.globalRemainingMs(command, user, fromTime) > 0;
  }

  isOnUserCooldown(command: ChatCommand, user: ChatUser, fromTime?: number): boolean {
    return this.userRemainingMs(command, user, fromTime) > 0;
  }

  isConfiguredCooldownZero(command: ChatCommand): boolean {
    return this.globalCooldownMs(command) <= 0 && this.userCooldownMs(command) <= 0;
  }

  recordUsage(command: ChatCommand, user: ChatUser, timestamp: number = Date.now()) {
    if (this.isBypassUser(user) || this.isConfiguredCooldownZero(command)) return;
    const key = commandKey(command);
    this.globalLastUsedMap.set(key, timestamp);
    let userMap = this.userLastUsedMap.get(key);
    if (!userMap) {
      userMap = new Map();
      this.userLastUsedMap.set(key, userMap);
    }
    userMap.set(normalizeUsername(user.userName), timestamp);
  }

  clearAll() {
    this.globalLastUsedMap.clear();
    this.userLastUsedMap.clear();
  }

  clearUser(username: string) {
    const normalized = normalizeUsername(username);
    for (const userMap of this.userLastUsedMap.values()) {
      userMap.delete(normalized);
    }
  }
}
