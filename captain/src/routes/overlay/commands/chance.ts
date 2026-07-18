import { getOverlayConfig } from '../constants';
import { getSubTier } from '$lib/api/subtiers';
import { properRandom } from '../utils';

export function getBaseChance(commandName: string): number {
  const chances = getOverlayConfig().commandChances as Record<string, number> | undefined;
  return chances?.[commandName] ?? chances?.default ?? 90;
}

export async function computeSuccessChance(
  commandName: string,
  userId: string,
  channelId: string,
  bitsBonus: number
): Promise<number> {
  const base = getBaseChance(commandName);

  let tier = 0;
  try {
    tier = await getSubTier(userId, channelId);
  } catch {
    // lookup failed, use 0
  }

  let tierBonus = 0;
  if (tier === 1) {
    tierBonus = 10;
  } else if (tier === 2 || tier === 3) {
    tierBonus = 12;
  }

  console.log(`Tier bonus from ${userId} is ${tierBonus}`);

  return Math.min(100, base + tierBonus + bitsBonus);
}

export function rollSuccess(chance: number): boolean {
  return properRandom() * 100 < chance;
}

export function timeoutSecondsForFailChance(failChance: number): number {
  return Math.max(10, Math.round(failChance / 10) * 10);
}
