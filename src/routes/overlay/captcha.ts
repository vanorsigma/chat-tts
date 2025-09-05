import type { ChatUserstate } from 'tmi.js';
import type { OverlayDispatchers, OverlayObserver } from './dispatcher';
import { getPointsForUser, setPointsForUser } from './pointsInterface';

const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const CAPTCHA_POINTS = 1000;
const CAPTCHA_DURATION = 10 * 1000;

function choose<T>(choices: Array<T>): T {
  const index = Math.floor(Math.random() * choices.length);
  return choices[index];
}

export class CaptchaObserver implements OverlayObserver {
  private answer: string;
  private dispatcher: OverlayDispatchers;
  private onSolve: () => void;
  private alreadyClaimed: Set<string> = new Set();
  private timeout: number | null;

  constructor(dispatcher: OverlayDispatchers, onSolve: () => void) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    this.answer = [...Array(6).keys()].map(_ => choose(characters.split(''))).join('');
    this.dispatcher = dispatcher;
    this.dispatcher.addObserver(this);
    this.onSolve = onSolve;
  }

  get value(): string {
    return this.answer;
  }

  async onMessage(user: ChatUserstate, message: string): Promise<void> {
    if (message.trim() === this.answer) {
      const username = user.username;
      if (!username) return;
      const points = await getPointsForUser(username) ?? 0;
      setPointsForUser(username, points + CAPTCHA_POINTS);
      this.dispatcher.sendMessageAsUser(`${username} claimed ${CAPTCHA_POINTS}!`);

      if (!this.timeout) {
        this.timeout = setTimeout(() => {
          this.dispatcher.removeObserver(this);
          this.onSolve();
        }, CAPTCHA_DURATION) as unknown as number;
      }
    }
  }
}
