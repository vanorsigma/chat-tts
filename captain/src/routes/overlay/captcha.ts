import type { OverlayDispatchers, OverlayObserver } from './dispatcher';
import { getPointsForUser, setPointsForUser } from './pointsInterface';
import type { ChatMessage } from '@twurple/chat';
import { karmaStore } from './stores.svelte';

const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const CAPTCHA_POINTS = 500;
const CAPTCHA_KARMA = 100;
const CAPTCHA_DURATION = 30 * 1000;

function choose<T>(choices: Array<T>): T {
  const index = Math.floor(Math.random() * choices.length);
  return choices[index];
}

export class CaptchaObserver implements OverlayObserver {
  private answer: string;
  private dispatcher: OverlayDispatchers;
  private onSolve: () => void;
  private alreadyClaimed: Set<string> = new Set();
  private solved: boolean = false;

  constructor(dispatcher: OverlayDispatchers, onSolve: () => void) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    this.answer = [...Array(6).keys()].map((_) => choose(characters.split(''))).join('');
    this.dispatcher = dispatcher;
    this.dispatcher.addObserver(this);
    this.onSolve = onSolve;
    setTimeout(() => {
      this.dispatcher.removeObserver(this);
      if (!this.solved) {
        this.onSolve()
      }
    }, CAPTCHA_DURATION);
  }

  get value(): string {
    return this.answer;
  }

  async onMessage(message: ChatMessage): Promise<void> {
    if (message.text.includes(this.answer)) {
      const username = message.userInfo.userName;
      if (!username) return;

      if (this.alreadyClaimed.has(username)) return;
      this.alreadyClaimed.add(username);

      const points = (await getPointsForUser(username)) ?? 0;
      setPointsForUser(username, points + CAPTCHA_POINTS);
      this.dispatcher.sendMessageAsUser(
        message.channelId!,
        `${username} claimed ${CAPTCHA_POINTS}!`
      );
      karmaStore.updateKarma(CAPTCHA_KARMA, 'Captcha');

      if (!this.solved) {
        this.solved = true;
        this.onSolve();
      }
    }
  }
}
