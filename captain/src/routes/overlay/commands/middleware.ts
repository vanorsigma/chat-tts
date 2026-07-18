import { getPointsForUser, setPointsForUser } from '$lib/api/points';
import type { OverlayDispatchers } from '../dispatcher';

export const COOLDOWN = 10 * 1000;
export const TOGGLE_COOLDOWN = 2 * 60 * 1000;
export const PEOPLE_WHO_CHECKED_IN: string[] = [];
export const TOGGLE_EXPIRY: Map<string, NodeJS.Timeout> = new Map();

let _checkCostAddIfEnoughLock: Promise<boolean> = Promise.resolve(true);
export async function checkCostAddIfEnough(
  dispatcher: OverlayDispatchers,
  broadcaster_id: string,
  username: string,
  difference: number,
  message_id: string | undefined = undefined,
  check_only: boolean = false
): Promise<boolean> {
  const currentTask = _checkCostAddIfEnoughLock
    .then(async () => {
      const points = (await getPointsForUser(username)) ?? 0;

      if (points + difference >= 0) {
        if (check_only) return true;
        await setPointsForUser(username, points + difference);
        return true;
      }

      if (check_only) return false;

      dispatcher.sendMessageAsUser(broadcaster_id, `you can't afford this PoorVanor`, message_id);
      return false;
    })
    .catch((err) => {
      console.error(err);
      return false;
    });
  _checkCostAddIfEnoughLock = currentTask;
  return await currentTask;
}
