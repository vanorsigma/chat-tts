import { json } from '@sveltejs/kit';
import { getController } from '$lib/server/runtime';
import type { VanorthonData, VanorthonMilestone } from '$lib/vanorthon';
import type { RequestHandler } from './$types';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isMilestone = (value: unknown): value is VanorthonMilestone => {
  if (value === null || typeof value !== 'object') return false;
  const milestone = value as Partial<Record<keyof VanorthonMilestone, unknown>>;
  return (
    typeof milestone.title === 'string' &&
    isFiniteNumber(milestone.cumulativeWeight) &&
    isFiniteNumber(milestone.progress) &&
    (milestone.cumulativeCost == null || isFiniteNumber(milestone.cumulativeCost))
  );
};

export const GET: RequestHandler = async () => {
  const config = getController()?.config;
  if (!config) return json({ error: 'Config not loaded' }, { status: 503 });

  const siteUrl = config.vanorthonConfig.url.trim().replace(/\/+$/, '');
  const key = config.vanorthonConfig.overlayKey.trim();
  if (!siteUrl) return json({ error: 'Vanorthon URL missing' }, { status: 503 });
  if (!key) return json({ error: 'Vanorthon overlay key missing' }, { status: 503 });

  let apiUrl: URL;
  try {
    apiUrl = new URL('api/overlay', `${siteUrl}/`);
  } catch {
    return json({ error: 'Vanorthon site URL invalid' }, { status: 503 });
  }
  if (apiUrl.protocol !== 'http:' && apiUrl.protocol !== 'https:') {
    return json({ error: 'Vanorthon site URL invalid' }, { status: 503 });
  }
  apiUrl.searchParams.set('key', key);

  try {
    const response = await fetch(apiUrl, {
      redirect: 'error',
      signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) return json({ error: 'Overlay data unavailable' }, { status: 502 });

    const data = (await response.json()) as {
      achievedWeight?: unknown;
      contributedCost?: unknown;
      rates?: { subsUnitValue?: unknown; bitsUnitValue?: unknown };
      milestones?: unknown;
    };
    const rates = data?.rates;
    const milestones = data?.milestones;
    const contributedCost = isFiniteNumber(data?.contributedCost) ? data.contributedCost : 0;
    if (
      !isFiniteNumber(data?.achievedWeight) ||
      !isFiniteNumber(rates?.subsUnitValue) ||
      !isFiniteNumber(rates?.bitsUnitValue) ||
      !Array.isArray(milestones) ||
      !milestones.every(isMilestone)
    ) {
      return json({ error: 'Overlay data invalid' }, { status: 502 });
    }

    const payload: VanorthonData = {
      siteUrl,
      rates: {
        subsUnitValue: rates.subsUnitValue,
        bitsUnitValue: rates.bitsUnitValue
      },
      achievedWeight: data.achievedWeight,
      contributedCost,
      milestones
    };
    return json(payload, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return json({ error: 'Overlay data unavailable' }, { status: 502 });
  }
};
