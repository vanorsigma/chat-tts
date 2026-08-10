import { parse } from 'yaml';
import { configSchema, type FieldSchema } from './config/schema';
import { mergeConfig } from './config/defaults';
import { ConfigParsingError, validateConfig } from './config/validate';
import type { SchemaToType, Equal } from './config/types';

export { ConfigParsingError };

interface RangeConfig {
  minimum: number;
  maximum: number;
}

export interface SoundEffect {
  tag: string;
  filePath: string;
}

export interface AlternativePitchControl {
  controlURLs: string[];
}

export interface StandaloneSongConfig {}

export interface DistractConfig {
  enabled: boolean;
  distractCooldown: number;
  rotateCooldown: number;
  distractChance: number;
  rotateChance: number;
}

export interface OverlayModerationConfig {
  moderatorUsers: string[];
  unblockableCommands: string[];
  blockMinimumBid: number;
  killCost: number;
}

export interface OverlayBlackSilenceConfig {
  user: string;
  durationMs: number;
  cost: number;
  karma: number;
}

export interface OverlayFlashbangConfig {
  cost: number;
  karma: number;
}

export interface OverlayMaxwellConfig {
  cost: number;
  user: string;
  cooldownMs: number;
  limit: number;
}

export interface OverlayGrayscaleConfig {
  cost: number;
  karma: number;
  shader: string;
  durationMs: number;
}

export interface OverlayCutConfig {
  cost: number;
  user: string;
  karma: number;
  shader: string;
  durationMs: number;
  momentDelayMs: number;
}

export interface OverlayMistakeConfig {
  cost: number;
  user: string;
  karma: number;
}

export interface OverlayShowImageConfig {
  cost: number;
  user: string;
  cooldownMs: number;
  karma: number;
}

export interface OverlayPlayAudioConfig {
  cost: number;
  user: string;
  karma: number;
}

export interface OverlayResetCooldownConfig {
  cost: number;
}

export interface OverlaySelfThoughtConfig {
  cost: number;
  karma: number;
}

export interface OverlayGoodNightKissConfig {
  cost: number;
  user: string;
  karma: number;
  timeoutDurationSec: number;
}

export interface OverlaySetTitleConfig {
  cost: number;
  karmaRequirement: number;
  karmaModifier: number;
  user: string;
}

export interface OverlayKarmaEntry {
  command: string;
  karma: number;
}

export interface OverlayToggleEntry {
  name: string;
  karma: number;
}

export interface OverlayKarmaConfig {
  min: number;
  max: number;
  dingThreshold: number;
  decayRate: number;
  karmaMap: OverlayKarmaEntry[];
  togglesKarma: OverlayToggleEntry[];
}

export interface OverlayModelConfig {
  initialHeartrate: number;
  blushHrThreshold: number;
  despairHrThreshold: number;
}

export interface OverlayCaptchaConfig {
  points: number;
  karma: number;
  durationMs: number;
}

export interface OverlayCheckInConfig {
  points: number;
}

export interface OverlayFontConfig {
  cost: number;
  user: string;
}

export interface OverlayPollConfig {}

export interface OverlayPredictionConfig {}

export interface OverlayEconomyConfig {
  cooldownMs: number;
}

export interface OverlayWatchStreakConfig {
  streakInterval: number;
}

export interface OverlayEndstreamConfig {}

export interface OverlayBidConfig {}

export interface OverlayVoiceConfig {}

export interface OverlayRestartConfig {}

export interface OverlayStockMarketConfig {
  cycleIntervalMs: number;
  checkinGrantPoints: number;
  cooldownMs: number;
  approvedStocks: string[];
  buyFailSteepness: number;
  overpayFactor: number;
}

export interface OverlayCommandCooldownsConfig {
  poll: number;
  prediction: number;
  flashbang: number;
  selfthought: number;
  undress: number;
  stars: number;
  hearts: number;
  block: number;
  unblock: number;
  kill: number;
  grayscale: number;
  cut: number;
}

export interface OverlayCommandChancesConfig {
  default: number;
  flashbang: number;
  grayscale: number;
  cut: number;
}

export interface OverlayPositionsConfig {
  artistWidgetX: number;
  artistWidgetY: number;
  artistWidgetWidth: number;
  artistWidgetHeight: number;
  rightPanelX: number;
  rightPanelY: number;
  rightPanelWidth: number;
  rightPanelHeight: number;
  pinX: number;
  pinY: number;
  pinWidth: number;
  pinHeight: number;
  wheelX: number;
  wheelY: number;
  wheelWidth: number;
  wheelHeight: number;
}

export interface StartingSoonArtEntry {
  file: string;
  artist: string;
}

export interface StartingSoonConfig {
  images: StartingSoonArtEntry[];
}

export interface RemoteVoiceConfig {
  controlURL: string;
}

export interface RemoteChatTTSControllerConfig {}

export interface DelegateVoiceToOverlayConfig {}

export interface MakiConfig {
  twitchClientId: string;
  twitchClientSecret: string;
  broadcasterName: string;
  openrouterApiKey: string;
  makiModel: string;
  evaluatorModel: string;
  deepReasoningModel: string;
  deepReasoningMaxTokens: number;
  maxTokens: number;
  communicationBusUrl: string;
  screenshotDisplay: number;
  textSpeed: number;
}

export interface RedeemEntry {
  id: string;
  kind: string;
  amount: number;
}

export interface RedeemConfig {
  redeems: RedeemEntry[];
}

// For anything adjustable from the UI
export interface DynamicConfig {
  songPitchSpeedAffected: boolean;
}

export interface FullConfig {
  channelName: string;
  commandsDisabled: boolean;
  startingSoonConfig: StartingSoonConfig;
  alternativePitchControl?: AlternativePitchControl;
  voices: string[];
  pitchRange: RangeConfig;
  rateRange: RangeConfig;
  filteredExps: string[];
  soundEffects: SoundEffect[];
  standaloneSongConfig?: StandaloneSongConfig;
  remoteVoiceConfig?: RemoteVoiceConfig;
  distractConfig?: DistractConfig;
  moderationConfig: OverlayModerationConfig;
  blackSilenceConfig: OverlayBlackSilenceConfig;
  flashbangConfig?: OverlayFlashbangConfig;
  maxwellConfig: OverlayMaxwellConfig;
  mistakeConfig?: OverlayMistakeConfig;
  grayscaleConfig?: OverlayGrayscaleConfig;
  cutConfig: OverlayCutConfig;
  showImageConfig: OverlayShowImageConfig;
  playAudioConfig?: OverlayPlayAudioConfig;
  selfThoughtConfig?: OverlaySelfThoughtConfig;
  resetCooldownConfig: OverlayResetCooldownConfig;
  goodNightKissConfig?: OverlayGoodNightKissConfig;
  setTitleConfig?: OverlaySetTitleConfig;
  karmaConfig: OverlayKarmaConfig;
  modelConfig: OverlayModelConfig;
  captchaConfig: OverlayCaptchaConfig;
  checkInConfig?: OverlayCheckInConfig;
  fontConfig?: OverlayFontConfig;
  pollConfig?: OverlayPollConfig;
  predictionConfig?: OverlayPredictionConfig;
  economyConfig?: OverlayEconomyConfig;
  watchStreakConfig: OverlayWatchStreakConfig;
  endstreamConfig?: OverlayEndstreamConfig;
  bidConfig?: OverlayBidConfig;
  voiceConfig?: OverlayVoiceConfig;
  restartConfig?: OverlayRestartConfig;
  stockMarketConfig: OverlayStockMarketConfig;
  commandCooldownsConfig: OverlayCommandCooldownsConfig;
  commandChancesConfig: OverlayCommandChancesConfig;
  overlayPositionsConfig: OverlayPositionsConfig;
  dynamicConfig: DynamicConfig;
  remoteChatTTS?: RemoteChatTTSControllerConfig;
  delegateVoiceToOverlay?: DelegateVoiceToOverlayConfig;
  ignorePrefix: string;
  makiConfig: MakiConfig;
  redeemConfig: RedeemConfig;
}

export function parseConfig(raw: unknown): FullConfig {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ConfigParsingError('Config must be an object');
  }
  const obj = raw as Record<string, unknown>;
  for (const field of configSchema as readonly FieldSchema[]) {
    if (field.required && field.kind !== 'optional-object' && !Object.hasOwn(obj, field.key)) {
      throw new ConfigParsingError(
        `Field ${field.key} is missing from the config, cannot continue`
      );
    }
  }
  validateConfig(configSchema, obj);
  return mergeConfig(configSchema, obj);
}

export function parseYaml(input: string): FullConfig {
  return parseConfig(parse(input));
}

type _Expect<T extends true> = T;

type _ConfigShape = SchemaToType<typeof configSchema>;
type _HandConfig = Omit<FullConfig, 'dynamicConfig'>;

type _KeysMatch<H extends object, D extends object> = [
  Exclude<keyof H, keyof D>,
  Exclude<keyof D, keyof H>
] extends [never, never]
  ? true
  : false;

type _PerFieldMatch<H extends object, D extends object> = {
  [K in keyof H & keyof D]: Equal<H[K], D[K]>;
}[keyof H & keyof D];

// Compile-time check that FullConfig matches the shape implied by configSchema.
// Fix drift in the interfaces above or in schema.ts / commands/definitions.ts.
type _ConfigShapeParity = _Expect<
  _KeysMatch<_HandConfig, _ConfigShape> extends true
    ? _PerFieldMatch<_HandConfig, _ConfigShape> extends true
      ? true
      : false
    : false
>;
