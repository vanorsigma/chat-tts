/**
 * Commands that only work if an overlay exists
 */

import type { ChatUserstate } from 'tmi.js';
import { OverlayDispatchers, type OverlayObserver } from './dispatcher';
import { pollCommandHandler } from './poll.svelte';
import { blackSilenceStore, flashbangStore } from './stores.svelte';
import type { CancelTTS, DisableTTS } from '$lib/remoteTTSMessages';
import { getPointsForUser, setPointsForUser } from './pointsInterface';

export const BLACK_SILENCE_USER = 'nikitakik228';
export const BLACK_SILENCE_DURATION = 10 * 1000;
export const BLACK_SILENCE_COST = 500;

export const FLASHBANG_COST = 50;

export const CHECK_IN_POINTS = 100;

const COOLDOWN = 10 * 1000;
const PEOPLE_WHO_CHECKED_IN: string[] = [];

async function checkCostAddIfEnough(dispatcher: OverlayDispatchers, username: string, difference: number): Promise<boolean> {
  const points = await getPointsForUser(username) ?? 0;

  if (points + difference >= 0) {
    await setPointsForUser(username, points + difference);
    return true;
  } else {
    dispatcher.sendMessageAsUser(`${username}, you can't afford this`);
    return false;
  }
}

async function transferHandler(dispatcher: OverlayDispatchers, user: ChatUserstate, message: string) {
  const splits = message.split(' ');
  const target = splits[1].toLowerCase();
  const amount = Number(splits[2]);

  if (!user.username) return;

  const username = user.username;

  if (amount <= 0) {
    dispatcher.sendMessageAsUser('Must transfer a positive amount');
    return;
  }

  if (!await checkCostAddIfEnough(dispatcher, username, -amount)) return;
  const points = await getPointsForUser(target) ?? 0;
  await setPointsForUser(target, points + amount);
  dispatcher.sendMessageAsUser(`${username} transferred ${amount} to ${target}`);
}

function getCostHandler(dispatcher: OverlayDispatchers, message: string) {
  const subcommand = message.split(' ')[1];

  switch (subcommand) {
    case 'blacksilence':
      dispatcher.sendMessageAsUser(`${BLACK_SILENCE_COST}`);
      break;

    case 'flashbang':
      dispatcher.sendMessageAsUser(`${FLASHBANG_COST}`);
      break;

    default:
      dispatcher.sendMessageAsUser(`~ %blacksilence: ${BLACK_SILENCE_COST}; %flashbang: ${FLASHBANG_COST}`);
      break;
  }
}

async function givePointsHandler(dispatcher: OverlayDispatchers, user: ChatUserstate, message: string) {
  if (!user.username) return;
  if (!user.badges?.broadcaster) return;

  const splitted = message.split(' ');
  const target = splitted[1];
  const cost = Number(splitted[2]);

  const points = await getPointsForUser(target) ?? 0;
  await setPointsForUser(target, points + cost);
  dispatcher.sendMessageAsUser(`given ${cost} to ${target}`);
}

function getPointsHandler(dispatcher: OverlayDispatchers, user: ChatUserstate, message: string) {
  if (!user.username) return;

  const username = user.username;
  const target = message.split(' ').at(1) ?? username;

  // immediate async execution
  (async () => {
    const points = await getPointsForUser(target);
    dispatcher.sendMessageAsUser(`${target} has ${points} vanorsmol s`);
  })();
}

function checkInHandler(dispatcher: OverlayDispatchers, user: ChatUserstate, message: string) {
  if (!user.username) return;

  const username = user.username;
  if (PEOPLE_WHO_CHECKED_IN.includes(user.username)) {
    dispatcher.sendMessageAsUser(`${user.username} you've already checked in RAGEY`);
    return
  }

  dispatcher.sendMessageAsUser(`meow ${user.username} vedalWave, here's +${CHECK_IN_POINTS}`);
  PEOPLE_WHO_CHECKED_IN.push(user.username);

  checkCostAddIfEnough(dispatcher, username, CHECK_IN_POINTS);
}

async function flashbangHandler(dispatcher: OverlayDispatchers, user: ChatUserstate, message: string) {
  if (Math.random() < 0.5) {
    const username = user.username;
    if (!username) return;

    if (await checkCostAddIfEnough(dispatcher, username, -FLASHBANG_COST)) {
      flashbangStore.increment();
      dispatcher.sendMessageAsUser(`Throwing a flashbang, -${FLASHBANG_COST}`);
    }
  } else {
    dispatcher.sendMessageAsUser('NO xdHAH');
  }
}

function blackSilenceHandler(dispatcher: OverlayDispatchers, user: ChatUserstate, ws: WebSocket) {
  if (!user.username) return;

  const username = user.username;

  (async () => {
    if (username === BLACK_SILENCE_USER) {
      dispatcher.sendMessageAsUser('ok');
    } else {
      if (!await checkCostAddIfEnough(dispatcher, username, -BLACK_SILENCE_COST)) return;
      dispatcher.sendMessageAsUser(`-${BLACK_SILENCE_COST}`);
    }

    blackSilenceStore.increment();

    ws.send(
      JSON.stringify({
        type: 'tts',
        command: {
          type: 'cancel'
        }
      } as CancelTTS)
    );

    ws.send(
      JSON.stringify({
        type: 'tts',
        command: {
          type: 'disable',
          duration: BLACK_SILENCE_DURATION / 1000
        }
      } as DisableTTS)
    );
  })();
}

function placeholderHandler(dispatcher: OverlayDispatchers, user: ChatUserstate, message: string) {
  dispatcher.sendMessageAsUser('meow');
}

export class Commands implements OverlayObserver {
  dispatchers?: OverlayDispatchers = undefined;
  nextValid: number = new Date().getTime();

  private busWs?: WebSocket = undefined;

  constructor(dispatchers?: OverlayDispatchers) {
    this.dispatchers = dispatchers;
  }

  setBusURL(url: string) {
    if (this.busWs) {
      this.busWs.close();
    }

    const ws = new WebSocket(url);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ws.onopen = (_) => {
      console.log('ws open');
      this.busWs = ws;
    };

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ws.onclose = (_) => {
      console.log('ws close');
      this.busWs = undefined;
    };
  }

  callOnlyIfPastCooldown(callback: () => void) {
    if (new Date().getTime() >= this.nextValid) {
      callback();
      this.nextValid = new Date().getTime() + COOLDOWN;
    }
  }

  onMessage(user: ChatUserstate, message: string): void {
    if (!this.dispatchers) {
      throw new Error('No dispatcher');
    }

    const dispatcher = this.dispatchers;
    const commandIndicator = message.split(' ')[0];
    switch (commandIndicator) {
      case '%poll':
        this.callOnlyIfPastCooldown(() => pollCommandHandler(dispatcher, user, message));
        break;
      case '%checkin':
        checkInHandler(dispatcher, user, message);
        break;
      case '%flashbang':
        this.callOnlyIfPastCooldown(() => flashbangHandler(dispatcher, user, message));
        break;
      case '%blacksilence':
        if (this.busWs) blackSilenceHandler(dispatcher, user, this.busWs);
        else dispatcher.sendMessageAsUser('tell vanor he\'s dumb');
        break;
      case '%points':
        getPointsHandler(dispatcher, user, message);
        break;
      case '%cost':
        getCostHandler(dispatcher, message);
        break;
      case '%givepoints':
        givePointsHandler(dispatcher, user, message);
        break;
      case '%transfer':
        transferHandler(dispatcher, user, message);
        break;
    }
    return;
  }
}
