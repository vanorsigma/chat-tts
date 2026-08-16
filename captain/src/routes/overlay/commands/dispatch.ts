import type { OverlayDispatchers } from '../dispatcher';
import type { ChatMessage } from '@twurple/chat';
import type { Commands } from './index';
import type { ChatCommand } from './registry';
import type { GatedCommand } from './definitions';
import type {
  OverlayBlackSilenceConfig,
  OverlayCheckInConfig,
  OverlayCutConfig,
  OverlayFlashbangConfig,
  OverlayFontConfig,
  OverlayGoodNightKissConfig,
  OverlayGrayscaleConfig,
  OverlayKarmaConfig,
  OverlayMaxwellConfig,
  OverlayMistakeConfig,
  OverlayModerationConfig,
  OverlayPlayAudioConfig,
  OverlayResetCooldownConfig,
  OverlaySelfThoughtConfig,
  OverlaySetTitleConfig,
  OverlayShowImageConfig
} from '$lib/config';
import {
  transferHandler,
  givePointsHandler,
  getPointsHandler,
  checkInHandler,
  medianHandler
} from './handlers/economy';
import {
  maxwellHandler,
  flashbangHandler,
  blackSilenceHandler,
  mistakeHandler,
  selfThoughtHandler,
  grayscaleHandler,
  cutHandler,
  rotateHandler
} from './handlers/redeems';
import { mediaHandler } from './handlers/media';
import {
  buyHandler,
  sellHandler,
  stocksHandler,
  endStreamHandler as stockEndStreamHandler
} from './handlers/stockmarket';
import {
  goodnightkissHandler,
  settitleHandler,
  giveKarmaHandler,
  togglesHandler
} from './handlers/interactive';
import {
  blockHandler,
  killHandler,
  restartHandler,
  resetCooldownHandler
} from './handlers/moderation';
import { gambaHandler } from './handlers/gamba';
import { lotteryHandler } from './handlers/lottery';
import { checkHandler } from './handlers/evaluate';
import { fontCommandHandler } from './handlers/font';
import { pollCommandHandler, endPollCommandHandler } from '../poll.svelte';
import { predictionCommandHandler, endPredictionCommandHandler } from '../prediction.svelte';

export type CommandRunner = (
  commands: Commands,
  dispatcher: OverlayDispatchers,
  message: ChatMessage,
  sectionConfig: unknown
) => void | Promise<void>;

export const COMMAND_HANDLERS: Partial<Record<ChatCommand, CommandRunner>> = {
  '%poll': (_commands, dispatcher, message) => pollCommandHandler(dispatcher, message),
  '%endpoll': (_commands, dispatcher, message) => endPollCommandHandler(dispatcher, message),
  '%prediction': (_commands, dispatcher, message) => predictionCommandHandler(dispatcher, message),
  '%endprediction': (_commands, dispatcher, message) =>
    endPredictionCommandHandler(dispatcher, message),
  '%chicken': (commands, dispatcher, message, config) =>
    checkInHandler(dispatcher, message, commands.busWs, config as OverlayCheckInConfig),
  '%checkin': (commands, dispatcher, message, config) =>
    checkInHandler(dispatcher, message, commands.busWs, config as OverlayCheckInConfig),
  '%flashbang': (_commands, dispatcher, message, config) =>
    flashbangHandler(dispatcher, message, config as OverlayFlashbangConfig),
  '%blacksilence': (commands, dispatcher, message, config) =>
    blackSilenceHandler(dispatcher, message, commands.busWs!, config as OverlayBlackSilenceConfig),
  '%points': (_commands, dispatcher, message) => getPointsHandler(dispatcher, message),
  '%givepoints': (_commands, dispatcher, message) => givePointsHandler(dispatcher, message),
  '%transfer': (_commands, dispatcher, message) => transferHandler(dispatcher, message),
  '%maxwell': (_commands, dispatcher, message, config) =>
    maxwellHandler(dispatcher, message, config as OverlayMaxwellConfig),
  '%median': (_commands, dispatcher, message) => medianHandler(dispatcher, message),
  '%mistake': (_commands, dispatcher, message, config) =>
    mistakeHandler(dispatcher, message, config as OverlayMistakeConfig),
  '%si': (_commands, dispatcher, message, config) =>
    mediaHandler(dispatcher, message, 'image', config as OverlayShowImageConfig),
  '%showimage': (_commands, dispatcher, message, config) =>
    mediaHandler(dispatcher, message, 'image', config as OverlayShowImageConfig),
  '%pa': (_commands, dispatcher, message, config) =>
    mediaHandler(dispatcher, message, 'audio', config as OverlayPlayAudioConfig),
  '%playsound': (_commands, dispatcher, message, config) =>
    mediaHandler(dispatcher, message, 'audio', config as OverlayPlayAudioConfig),
  '%playaudio': (_commands, dispatcher, message, config) =>
    mediaHandler(dispatcher, message, 'audio', config as OverlayPlayAudioConfig),
  '%buy': (commands, dispatcher, message) => buyHandler(commands, dispatcher, message),
  '%sell': (_commands, dispatcher, message) => sellHandler(dispatcher, message),
  '%stocks': (_commands, dispatcher, message) => stocksHandler(dispatcher, message),
  '%endstream': (commands, dispatcher, message) => {
    stockEndStreamHandler(dispatcher, message);
    if (message.userInfo.isBroadcaster) void commands.flushBits(dispatcher, message);
  },
  '%gamba': (commands, dispatcher, message) => gambaHandler(commands, dispatcher, message),
  '%lottery': (commands, dispatcher, message) => lotteryHandler(commands, dispatcher, message),
  '%selfthought': (_commands, dispatcher, message, config) =>
    selfThoughtHandler(dispatcher, message, config as OverlaySelfThoughtConfig),
  '%goodnightkiss': (_commands, dispatcher, message, config) =>
    goodnightkissHandler(dispatcher, message, config as OverlayGoodNightKissConfig),
  '%settitle': (_commands, dispatcher, message, config) =>
    settitleHandler(dispatcher, message, config as OverlaySetTitleConfig),
  '%givekarma': (_commands, dispatcher, message) => giveKarmaHandler(dispatcher, message),
  '%restart': (_commands, dispatcher, message) => restartHandler(dispatcher, message),
  '%undress': (_commands, dispatcher, message, config) =>
    togglesHandler(dispatcher, message, 'Undress', config as OverlayKarmaConfig),
  '%stars': (_commands, dispatcher, message, config) =>
    togglesHandler(dispatcher, message, 'Stars', config as OverlayKarmaConfig),
  '%hearts': (_commands, dispatcher, message, config) =>
    togglesHandler(dispatcher, message, 'Hearts', config as OverlayKarmaConfig),
  '%block': (commands, dispatcher, message, config) =>
    blockHandler(commands, dispatcher, message, 'block', config as OverlayModerationConfig),
  '%unblock': (commands, dispatcher, message, config) =>
    blockHandler(commands, dispatcher, message, 'unblock', config as OverlayModerationConfig),
  '%kill': (_commands, dispatcher, message) => killHandler(dispatcher, message),
  '%grayscale': (commands, dispatcher, message, config) =>
    grayscaleHandler(dispatcher, message, commands.busWs!, config as OverlayGrayscaleConfig),
  '%cut': (commands, dispatcher, message, config) =>
    cutHandler(dispatcher, message, commands.busWs!, commands, config as OverlayCutConfig),
  '%rotate': (commands, dispatcher, message) => rotateHandler(dispatcher, message, commands.busWs!),
  '%resetcooldown': (commands, dispatcher, message, config) =>
    resetCooldownHandler(commands, dispatcher, message, config as OverlayResetCooldownConfig),
  '%important': (commands, dispatcher, message) => commands.importantHandler(dispatcher, message),
  '%unimportant': (commands, dispatcher, message) =>
    commands.unimportantHandler(dispatcher, message),
  '%check': (commands, dispatcher, message) => checkHandler(commands, dispatcher, message),
  '%font': (commands, dispatcher, message, config) =>
    fontCommandHandler(commands, dispatcher, message, config as OverlayFontConfig)
};

type _Expect<T extends true> = T;

// Every command that can be dispatched from chat must have a handler here.
// Add a new entry when registering a command in definitions.ts.
type _HandlerCoverage = _Expect<GatedCommand extends keyof typeof COMMAND_HANDLERS ? true : false>;
