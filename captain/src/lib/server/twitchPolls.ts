import { getBroadcasterApi } from '$lib/server/twitchAuth';
import { getSenderWs } from '$lib/server/runtime';
import { EventSubWsListener } from '@twurple/eventsub-ws';
import { ApiClient } from '@twurple/api';
import type { HelixCreatePredictionData } from '@twurple/api';
import type {
  EventSubChannelPollBeginEvent,
  EventSubChannelPollProgressEvent,
  EventSubChannelPollEndEvent,
  EventSubChannelPredictionBeginEvent,
  EventSubChannelPredictionProgressEvent,
  EventSubChannelPredictionLockEvent,
  EventSubChannelPredictionEndEvent
} from '@twurple/eventsub-base';
import type { PollUpdateMessage, PredictionUpdateMessage } from '$lib/bus/messages';

let api: ApiClient | null = null;
let broadcasterId: string = '';
let listener: EventSubWsListener | null = null;
let currentPollId: string | null = null;
let currentPredictionId: string | null = null;
let initialized = false;

function broadcast(msg: PollUpdateMessage | PredictionUpdateMessage) {
  const ws = getSenderWs();
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function handlePollBegin(event: EventSubChannelPollBeginEvent) {
  currentPollId = event.id;
  broadcast({
    type: 'poll-update',
    id: event.id,
    title: event.title,
    options: event.choices.map((c) => ({
      id: c.id,
      name: c.title,
      votes: 0,
      channelPoints: 0
    })),
    totalVotes: 0,
    status: 'active',
    startDate: event.startDate.toISOString(),
    endDate: event.endDate.toISOString()
  });
}

function handlePollProgress(event: EventSubChannelPollProgressEvent) {
  broadcast({
    type: 'poll-update',
    id: event.id,
    title: event.title,
    options: event.choices.map((c) => ({
      id: c.id,
      name: c.title,
      votes: c.totalVotes,
      channelPoints: c.channelPointsVotes
    })),
    totalVotes: event.choices.reduce((s, c) => s + c.totalVotes, 0),
    status: 'active',
    startDate: event.startDate.toISOString(),
    endDate: event.endDate.toISOString()
  });
}

function handlePollEnd(event: EventSubChannelPollEndEvent) {
  if (currentPollId === event.id) {
    currentPollId = null;
  }
  broadcast({
    type: 'poll-update',
    id: event.id,
    title: event.title,
    options: event.choices.map((c) => ({
      id: c.id,
      name: c.title,
      votes: c.totalVotes,
      channelPoints: c.channelPointsVotes
    })),
    totalVotes: event.choices.reduce((s, c) => s + c.totalVotes, 0),
    status: event.status === 'completed' ? 'completed' : 'terminated',
    startDate: event.startDate.toISOString(),
    endDate: event.endDate.toISOString()
  });
}

function handlePredictionBegin(event: EventSubChannelPredictionBeginEvent) {
  currentPredictionId = event.id;
  broadcast({
    type: 'prediction-update',
    id: event.id,
    title: event.title,
    outcomes: event.outcomes.map((o) => ({
      id: o.id,
      name: o.title,
      channelPoints: 0,
      voters: 0,
      color: o.color
    })),
    status: 'active',
    winningOutcomeId: null,
    startDate: event.startDate.toISOString(),
    endDate: event.lockDate.toISOString()
  });
}

function handlePredictionProgress(event: EventSubChannelPredictionProgressEvent) {
  broadcast({
    type: 'prediction-update',
    id: event.id,
    title: event.title,
    outcomes: event.outcomes.map((o) => ({
      id: o.id,
      name: o.title,
      channelPoints: o.channelPoints,
      voters: o.users,
      color: o.color
    })),
    status: 'active',
    winningOutcomeId: null,
    startDate: event.startDate.toISOString(),
    endDate: event.lockDate.toISOString()
  });
}

function handlePredictionLock(event: EventSubChannelPredictionLockEvent) {
  broadcast({
    type: 'prediction-update',
    id: event.id,
    title: event.title,
    outcomes: event.outcomes.map((o) => ({
      id: o.id,
      name: o.title,
      channelPoints: o.channelPoints,
      voters: o.users,
      color: o.color
    })),
    status: 'locked',
    winningOutcomeId: null,
    startDate: event.startDate.toISOString(),
    endDate: event.startDate.toISOString()
  });
}

function handlePredictionEnd(event: EventSubChannelPredictionEndEvent) {
  if (currentPredictionId === event.id) {
    currentPredictionId = null;
  }
  broadcast({
    type: 'prediction-update',
    id: event.id,
    title: event.title,
    outcomes: event.outcomes.map((o) => ({
      id: o.id,
      name: o.title,
      channelPoints: o.channelPoints,
      voters: o.users,
      color: o.color
    })),
    status: event.status === 'resolved' ? 'resolved' : 'canceled',
    winningOutcomeId: event.winningOutcomeId,
    startDate: event.startDate.toISOString(),
    endDate: event.endDate.toISOString()
  });
}

export async function initializeTwitchPolls() {
  if (initialized) return;
  initialized = true;

  const built = getBroadcasterApi();
  if (!built) {
    console.warn(
      'twitchPolls: No broadcaster token available. Polls and predictions will be unavailable.'
    );
    return;
  }

  api = built.api;
  broadcasterId = built.userId;

  listener = new EventSubWsListener({ apiClient: api });
  listener.start();

  listener.onChannelPollBegin(broadcasterId, handlePollBegin);
  listener.onChannelPollProgress(broadcasterId, handlePollProgress);
  listener.onChannelPollEnd(broadcasterId, handlePollEnd);
  listener.onChannelPredictionBegin(broadcasterId, handlePredictionBegin);
  listener.onChannelPredictionProgress(broadcasterId, handlePredictionProgress);
  listener.onChannelPredictionLock(broadcasterId, handlePredictionLock);
  listener.onChannelPredictionEnd(broadcasterId, handlePredictionEnd);
  console.log(`twitchPolls: Subscribed to poll/prediction events for broadcaster ${broadcasterId}`);
}

export async function createPoll(data: {
  title: string;
  choices: string[];
  duration: number;
}): Promise<{ id: string } | null> {
  if (!api || !broadcasterId) {
    console.warn('createPoll: broadcaster API not initialized');
    return null;
  }
  const poll = await api.polls.createPoll(broadcasterId, data);
  currentPollId = poll.id;
  return { id: poll.id };
}

export async function endPoll(): Promise<boolean> {
  if (!api || !broadcasterId || !currentPollId) return false;
  await api.polls.endPoll(broadcasterId, currentPollId, true);
  return true;
}

export async function createPrediction(
  data: HelixCreatePredictionData
): Promise<{ id: string } | null> {
  if (!api || !broadcasterId) {
    console.warn('createPrediction: broadcaster API not initialized');
    return null;
  }
  const prediction = await api.predictions.createPrediction(broadcasterId, data);
  currentPredictionId = prediction.id;
  return { id: prediction.id };
}

export async function lockPrediction(): Promise<boolean> {
  if (!api || !broadcasterId || !currentPredictionId) return false;
  await api.predictions.lockPrediction(broadcasterId, currentPredictionId);
  return true;
}

export async function cancelPrediction(): Promise<boolean> {
  if (!api || !broadcasterId || !currentPredictionId) return false;
  await api.predictions.cancelPrediction(broadcasterId, currentPredictionId);
  return true;
}
