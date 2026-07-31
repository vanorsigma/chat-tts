import type { Commands } from '../index';
import type { ChatMessage } from '@twurple/chat';
import { asChatCommand, type ChatCommand } from '../registry';
import type { OverlayDispatchers } from '../../dispatcher';
import { computeCommandChance } from '../chance';
import { requireUsername } from './shared';
import { evaluateBuy } from './stockmarket';

export interface EvaluationResult {
  innerSuccessChance?: number;
  innerFailChance?: number;
  error?: string;
}

export type ChanceProvider = (
  commands: Commands,
  message: ChatMessage
) => Promise<EvaluationResult | null>;

export const defaultProvider: ChanceProvider = async () => null;

async function buyChanceProvider(
  commands: Commands,
  message: ChatMessage
): Promise<EvaluationResult | null> {
  const result = await evaluateBuy(commands, message);
  console.debug('Buy chance provider result', result);
  if (result.error || !result.innerFailChance) return { error: result.error };
  return {
    innerFailChance: result.innerFailChance,
    innerSuccessChance: Math.max(0, 100 - result.innerFailChance)
  };
}

export const chanceProviders = new Map<ChatCommand, ChanceProvider>();
chanceProviders.set('%buy', buyChanceProvider);

export function registerChanceProvider(cmd: ChatCommand, p: ChanceProvider): void {
  chanceProviders.set(cmd, p);
}

export async function getInnerChance(
  cmd: ChatCommand,
  commands: Commands,
  message: ChatMessage
): Promise<EvaluationResult | null> {
  const provider = chanceProviders.get(cmd) ?? defaultProvider;
  return provider(commands, message);
}

export async function checkHandler(
  commands: Commands,
  dispatcher: OverlayDispatchers,
  message: ChatMessage
) {
  const username = requireUsername(message);
  if (!username) return;

  const rawTargetArguments = message.text.split(' ').slice(1);
  const rawTargetCommand = rawTargetArguments[0].trim();
  const rawTargetInvocation = rawTargetArguments.join(' ');
  const targetCommand = asChatCommand(rawTargetCommand);

  if (rawTargetInvocation.length < 1) {
    dispatcher.sendMessageAsUser(
      message.channelId!,
      'insufficient arguments, try a command invocation, e.g. %check %buy HEART 100',
      message.id
    );
    return;
  }

  if (!targetCommand) {
    dispatcher.sendMessageAsUser(
      message.channelId!,
      'you provided an invalid command.',
      message.id
    );
    return;
  }

  if (message.userInfo.isBroadcaster) {
    dispatcher.sendMessageAsUser(
      message.channelId!,
      'you are the broadcaster silly! the chances are the same for you...',
      message.id
    );
    return;
  }

  const userId = message.userInfo.userId;
  const channelId = message.channelId!;
  const bitBonus = commands.getUserBitsBoost(username ?? '');
  const outer = await computeCommandChance(targetCommand, userId, channelId, bitBonus);
  console.debug(`Check outer gate: ${JSON.stringify(outer)}`);

  const syntheticMessage = {
    ...message,
    text: rawTargetInvocation
  } as ChatMessage;

  const inner = await getInnerChance(targetCommand, commands, syntheticMessage);
  console.debug(`Check inner gate: ${JSON.stringify(inner)}`);
  let replyText = `@${username}, gate chance: ${outer.successChance}%/${outer.failChance}% (timeout: ${outer.timeoutSec}s)`;
  if (inner)
    if (!inner.error)
      replyText += ` command-specific (${targetCommand}) chances: ${inner.innerSuccessChance}% / ${inner.innerFailChance}%`;
    else replyText += ` error when computing inner command chances: ${inner?.error}`;

  dispatcher.sendMessageAsUser(message.channelId!, replyText, message.id);
  return;
}
