import type { OverlayDispatchers, OverlayObserver } from './dispatcher';
import { checkCostAddIfEnough } from './commands/middleware';
import type { ChatMessage } from '@twurple/chat';
import { karmaStore } from './stores';
import { getOverlayConfig } from './constants';

const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function choose<T>(choices: Array<T>): T {
  const index = Math.floor(Math.random() * choices.length);
  return choices[index];
}

export function startCaptchaLoop(
  dispatcher: OverlayDispatchers,
  captchaElement: HTMLDivElement,
  setText: (val: string | null) => void,
  setPosition: (top: number, left: number) => void
) {
  function loop() {
    setTimeout(
      () => {
        setPosition(
          Math.random() *
            (window.innerHeight -
              Number(getComputedStyle(captchaElement).height.replace('px', ''))),
          Math.random() *
            (window.innerWidth - Number(getComputedStyle(captchaElement).width.replace('px', '')))
        );

        const captcha = new CaptchaObserver(dispatcher, () => {
          setText(null);
          loop();
        });
        setText(captcha.value);
      },
      Math.max(1000, Math.random() * 10 * 60 * 1000)
    );
  }

  loop();
}

export class CaptchaObserver implements OverlayObserver {
  private answer: string;
  private dispatcher: OverlayDispatchers;
  private onSolve: () => void;
  private alreadyClaimed: Set<string> = new Set();
  private solved: boolean = false;

  constructor(dispatcher: OverlayDispatchers, onSolve: () => void) {
    this.answer = [...Array(6).keys()].map((_) => choose(characters.split(''))).join('');
    this.dispatcher = dispatcher;
    this.dispatcher.addObserver(this);
    this.onSolve = onSolve;
    setTimeout(() => {
      this.dispatcher.removeObserver(this);
      if (!this.solved) {
        this.onSolve();
      }
    }, getOverlayConfig().captcha.durationMs);
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

      await checkCostAddIfEnough(
        this.dispatcher,
        message.channelId!,
        username,
        getOverlayConfig().captcha.points,
        false,
        undefined
      );
      this.dispatcher.sendMessageAsUser(
        message.channelId!,
        `${username} claimed ${getOverlayConfig().captcha.points}!`
      );
      karmaStore.updateKarma(getOverlayConfig().captcha.karma, 'Captcha');

      if (!this.solved) {
        this.solved = true;
        this.onSolve();
      }
    }
  }
}
