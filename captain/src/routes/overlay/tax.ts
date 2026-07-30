import { getPointsForUser, setPointsForUser } from '$lib/api/points';
import { PEOPLE_WHO_CHECKED_IN } from './commands/middleware';
import type { OverlayDispatchers, OverlayTimeoutObserver } from './dispatcher';
import { PUBLIC_TARGET_CHANNEL_ID } from '$env/static/public';

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export async function applyTimeoutTax(
  dispatcher: OverlayDispatchers,
  channelId: string,
  username: string,
  rate: number
): Promise<void> {
  const points = (await getPointsForUser(username)) ?? 0;
  const tax = Math.floor(points * rate);
  if (tax <= 0) {
    dispatcher.sendMessageAsUser(
      channelId,
      `@${username} had nothing to tax (${points}VD)`
    );
    return;
  }
  await setPointsForUser(username, Math.max(0, points - tax));
  dispatcher.sendMessageAsUser(
    channelId,
    `@${username} was taxed ${tax}VD (${Math.round(rate * 100)}%) on timeout (balance was ${points}VD)`
  );
}

export class TaxObserver implements OverlayTimeoutObserver {
  private dispatcher: OverlayDispatchers;

  constructor(dispatcher: OverlayDispatchers) {
    this.dispatcher = dispatcher;
    this.dispatcher.addTimeoutObserver(this);
  }

  async onTimeout(channel_name: string, username: string, _duration: number) {
    const channelUser = await this.dispatcher.getHelixUserFromName(channel_name);
    const channelId = channelUser?.id ?? PUBLIC_TARGET_CHANNEL_ID;

    const points = (await getPointsForUser(username)) ?? 0;

    const wealths = await Promise.all(
      PEOPLE_WHO_CHECKED_IN.map((u) => getPointsForUser(u))
    );
    const valid = wealths.filter((w): w is number => w !== null).filter((w) => w >= 0);
    const checkinMedian = median(valid);

    const rate = points > checkinMedian ? 0.2 : 0.05;

    await applyTimeoutTax(this.dispatcher, channelId, username, rate);
    console.log(
      `TaxObserver: ${username} taxed at ${rate * 100}% (points=${points}, median=${checkinMedian})`
    );
  }
}
