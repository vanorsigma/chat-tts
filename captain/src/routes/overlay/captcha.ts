import type { OverlayDispatchers, OverlayObserver } from './dispatcher';
import { checkCostAddIfEnough } from './commands/middleware';
import type { ChatMessage } from '@twurple/chat';
import { karmaStore } from './stores';
import { getOverlayConfig } from './constants';
import type { CommandsLike } from './gamba/gamba';
import { CAPTCHA_GAMBA_ITEMS } from './gamba/gamba';
import { enqueueGambaSpin } from './gamba/queue';
import { random } from '$lib/utils';

const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function choose<T>(choices: Array<T>): T {
  const index = Math.floor(random() * choices.length);
  return choices[index];
}

export function startCaptchaLoop(
  dispatcher: OverlayDispatchers,
  captchaElement: HTMLDivElement,
  setText: (val: string | null) => void,
  setPosition: (top: number, left: number) => void,
  commands: CommandsLike
) {
  const minMs = 10 * 60 * 1000;
  const maxMs = 30 * 60 * 1000;

  function loop() {
    setTimeout(
      () => {
        setPosition(
          random() *
            (window.innerHeight -
              Number(getComputedStyle(captchaElement).height.replace('px', ''))),
          random() *
            (window.innerWidth - Number(getComputedStyle(captchaElement).width.replace('px', '')))
        );

        const captcha = new CaptchaObserver(dispatcher, commands, () => {
          setText(null);
          loop();
        });
        setText(captcha.value);
      },
      minMs + random() * (maxMs - minMs)
    );
  }

  loop();
}

export class CaptchaObserver implements OverlayObserver {
  private answer: string;
  private dispatcher: OverlayDispatchers;
  private commands: CommandsLike;
  private onSolve: () => void;
  private alreadyClaimed: Set<string> = new Set();
  private solved: boolean = false;

  constructor(dispatcher: OverlayDispatchers, commands: CommandsLike, onSolve: () => void) {
    this.answer = [...Array(6).keys()].map((_) => choose(characters.split(''))).join('');
    this.dispatcher = dispatcher;
    this.commands = commands;
    this.dispatcher.addObserver(this);
    this.onSolve = onSolve;
    setTimeout(() => {
      this.dispatcher.removeObserver(this);
      if (!this.solved) {
        this.onSolve();
      }
    }, getOverlayConfig().captchaConfig.durationMs);
  }

  get value(): string {
    return this.answer;
  }

  async onMessage(message: ChatMessage): Promise<void> {
    if (message.text.toLowerCase().includes(this.answer.toLowerCase())) {
      const username = message.userInfo.userName;
      if (!username) return;

      if (this.alreadyClaimed.has(username)) return;
      this.alreadyClaimed.add(username);

      await checkCostAddIfEnough(
        this.dispatcher,
        message.channelId!,
        username,
        getOverlayConfig().captchaConfig.points
      );
      this.dispatcher.sendMessageAsUser(
        message.channelId!,
        `${username} claimed ${getOverlayConfig().captchaConfig.points}! Rolling gatcha...`
      );
      karmaStore.updateKarma(getOverlayConfig().captchaConfig.karma, 'Captcha');

      enqueueGambaSpin(
        {
          dispatcher: this.dispatcher,
          channelId: message.channelId!,
          username,
          bet: 0,
          commands: this.commands
        },
        1,
        CAPTCHA_GAMBA_ITEMS
      );

      if (!this.solved) {
        this.solved = true;
        this.onSolve();
      }
    }
  }
}
