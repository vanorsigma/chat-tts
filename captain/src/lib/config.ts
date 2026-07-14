import { parse } from 'yaml';

interface RangeConfigOptional {
  minimum?: number;
  maximum?: number;
}

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

export interface DistractConfigOptional {
  enabled?: boolean;
  distractCooldown?: number;
  rotateCooldown?: number;
  distractChance?: number;
  rotateChance?: number;
}

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

export interface OverlayCommandCooldownsConfig {
  poll?: number;
  flashbang?: number;
  selfthought?: number;
  undress?: number;
  stars?: number;
  hearts?: number;
  block?: number;
  unblock?: number;
  kill?: number;
}

export interface RemoteVoiceConfig {
  controlURL: string;
}

export interface RemoteChatTTSControllerConfig {}

export interface MakiConfigOptional {
  twitchClientId?: string;
  twitchClientSecret?: string;
  broadcasterName?: string;
  openrouterApiKey?: string;
  makiModel?: string;
  evaluatorModel?: string;
  maxTokens?: number;
  searchApiKey?: string;
  communicationBusUrl?: string;
  screenshotDisplay?: number;
}

export interface MakiConfig {
  twitchClientId: string;
  twitchClientSecret: string;
  broadcasterName: string;
  openrouterApiKey: string;
  makiModel: string;
  evaluatorModel: string;
  maxTokens: number;
  searchApiKey: string;
  communicationBusUrl: string;
  screenshotDisplay: number;
}

// For anything adjustable from the UI
export interface DynamicConfig {
  songPitchSpeedAffected: boolean;
}

export class ConfigParsingError extends Error {}

export class ParseableConfig {
  channelName?: string;
  commandsDisabled: boolean;
  alternativePitchControl?: AlternativePitchControl;
  voices?: string[];
  pitchRange?: RangeConfigOptional;
  rateRange?: RangeConfigOptional;
  filteredExps?: string[];
  soundEffects?: SoundEffect[];
  standaloneSongConfig?: StandaloneSongConfig;
  remoteVoiceConfig?: RemoteVoiceConfig;
  distractConfig?: DistractConfigOptional;
  remoteChatTTS?: RemoteChatTTSControllerConfig;
  ignorePrefix?: string;
  makiConfig?: MakiConfigOptional;

  overlayModerationConfig?: OverlayModerationConfig;
  overlayBlackSilenceConfig?: OverlayBlackSilenceConfig;
  overlayFlashbangConfig?: OverlayFlashbangConfig;
  overlayMaxwellConfig?: OverlayMaxwellConfig;
  overlayMistakeConfig?: OverlayMistakeConfig;
  overlayShowImageConfig?: OverlayShowImageConfig;
  overlayPlayAudioConfig?: OverlayPlayAudioConfig;
  overlaySelfThoughtConfig?: OverlaySelfThoughtConfig;
  overlayGoodNightKissConfig?: OverlayGoodNightKissConfig;
  overlaySetTitleConfig?: OverlaySetTitleConfig;
  overlayKarmaConfig?: OverlayKarmaConfig;
  overlayModelConfig?: OverlayModelConfig;
  overlayCaptchaConfig?: OverlayCaptchaConfig;
  overlayCheckInConfig?: OverlayCheckInConfig;
  overlayCommandCooldownsConfig?: OverlayCommandCooldownsConfig;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(arbitraryObject: any) {
    const nonOptionalFields = ['channelName', 'commandsDisabled'];

    for (const field of nonOptionalFields) {
      if (!Object.hasOwn(arbitraryObject, field)) {
        throw new ConfigParsingError(`Field ${field} is missing from the config, cannot continue`);
      }
    }

    this.channelName = arbitraryObject['channelName'];
    console.log(`Config parsed for channel: ${this.channelName}`);
    this.commandsDisabled = arbitraryObject['commandsDisabled'] ?? false;
    this.alternativePitchControl = arbitraryObject['alternativePitchControl'];
    this.voices = arbitraryObject['voices'];
    this.pitchRange = arbitraryObject['pitchRange'];
    this.rateRange = arbitraryObject['rateRange'];
    this.filteredExps = arbitraryObject['filteredExps'];
    this.soundEffects = arbitraryObject['soundEffects'];
    this.standaloneSongConfig = arbitraryObject['standaloneSongConfig'];
    this.remoteVoiceConfig = arbitraryObject['remoteVoiceConfig'];
    this.distractConfig = arbitraryObject['distractConfig'];
    this.remoteChatTTS = arbitraryObject['remoteChatTTS'];
    this.ignorePrefix = arbitraryObject['ignorePrefix'] ?? '~';
    this.makiConfig = arbitraryObject['makiConfig'];

    this.overlayModerationConfig = arbitraryObject['moderationConfig'];
    this.overlayBlackSilenceConfig = arbitraryObject['blackSilenceConfig'];
    this.overlayFlashbangConfig = arbitraryObject['flashbangConfig'];
    this.overlayMaxwellConfig = arbitraryObject['maxwellConfig'];
    this.overlayMistakeConfig = arbitraryObject['mistakeConfig'];
    this.overlayShowImageConfig = arbitraryObject['showImageConfig'];
    this.overlayPlayAudioConfig = arbitraryObject['playAudioConfig'];
    this.overlaySelfThoughtConfig = arbitraryObject['selfThoughtConfig'];
    this.overlayGoodNightKissConfig = arbitraryObject['goodNightKissConfig'];
    this.overlaySetTitleConfig = arbitraryObject['setTitleConfig'];
    this.overlayKarmaConfig = arbitraryObject['karmaConfig'];
    this.overlayModelConfig = arbitraryObject['modelConfig'];
    this.overlayCaptchaConfig = arbitraryObject['captchaConfig'];
    this.overlayCheckInConfig = arbitraryObject['checkInConfig'];
    this.overlayCommandCooldownsConfig = arbitraryObject['commandCooldownsConfig'];
  }

  toFullConfig(): FullConfig {
    return {
      channelName: this.channelName ?? '',
      commandsDisabled: this.commandsDisabled,
      voices: this.voices ?? [],
      alternativePitchControl: this.alternativePitchControl,
      pitchRange: {
        maximum: this.pitchRange?.maximum ?? 1.3,
        minimum: this.pitchRange?.minimum ?? 0.95
      },
      rateRange: {
        maximum: this.rateRange?.maximum ?? 2.0,
        minimum: this.rateRange?.minimum ?? 0.7
      },
      filteredExps: this.filteredExps ?? [],
      soundEffects: this.soundEffects ?? [],
      standaloneSongConfig: this.standaloneSongConfig,
      remoteVoiceConfig: this.remoteVoiceConfig,
      dynamicConfig: {
        songPitchSpeedAffected: false
      },
      distractConfig: {
        enabled: false,
        distractCooldown: 900,
        rotateCooldown: 300,
        distractChance: 0.001,
        rotateChance: 0.01,
        ...this.distractConfig
      },
      moderationConfig: {
        moderatorUsers: ['pastel8844', 'deplytha', 'asmodeus_desu'],
        unblockableCommands: [
          '%restart',
          '%block',
          '%unblock',
          '%closemarket',
          '%refreshVoice',
          '%rotate',
          '%distract'
        ],
        blockMinimumBid: 1000,
        killCost: 2000,
        ...this.overlayModerationConfig
      },
      blackSilenceConfig: {
        user: 'nikitakik228',
        durationMs: 10000,
        cost: 500,
        karma: 50,
        ...this.overlayBlackSilenceConfig
      },
      flashbangConfig: { cost: 500, karma: -100, ...this.overlayFlashbangConfig },
      maxwellConfig: {
        cost: 100,
        user: '5kuli',
        cooldownMs: 30000,
        limit: 100,
        ...this.overlayMaxwellConfig
      },
      mistakeConfig: { cost: 5000, user: 'mr_auto', karma: -1000, ...this.overlayMistakeConfig },
      showImageConfig: {
        cost: 10000,
        user: 'mayoigo_qwq',
        cooldownMs: 60000,
        karma: -200,
        ...this.overlayShowImageConfig
      },
      playAudioConfig: {
        cost: 10000,
        user: 'SpookiestSpooks',
        karma: -100,
        ...this.overlayPlayAudioConfig
      },
      selfThoughtConfig: { cost: 5000, karma: -200, ...this.overlaySelfThoughtConfig },
      goodNightKissConfig: {
        cost: 5000,
        user: 'pastel8844',
        karma: -300,
        timeoutDurationSec: 1800,
        ...this.overlayGoodNightKissConfig
      },
      setTitleConfig: {
        cost: 1000,
        karmaRequirement: 100,
        karmaModifier: -0.3,
        user: 'sekatsu1',
        ...this.overlaySetTitleConfig
      },
      karmaConfig: {
        min: -5000,
        max: 5000,
        dingThreshold: 250,
        decayRate: 0.01,
        karmaMap: [
          { command: '%rotate', karma: -100 },
          { command: '%distract', karma: -200 }
        ],
        togglesKarma: [
          { name: 'Hearts', karma: 5.0 },
          { name: 'Stars', karma: 5.0 },
          { name: 'Undress', karma: 50.0 }
        ],
        ...this.overlayKarmaConfig
      },
      modelConfig: {
        initialHeartrate: 50,
        blushHrThreshold: 80,
        despairHrThreshold: 50,
        ...this.overlayModelConfig
      },
      captchaConfig: { points: 500, karma: 100, durationMs: 30000, ...this.overlayCaptchaConfig },
      checkInConfig: { points: 999.99, ...this.overlayCheckInConfig },
      commandCooldownsConfig: {
        poll: 10000,
        flashbang: 10000,
        selfthought: 10000,
        undress: 1000,
        stars: 1000,
        hearts: 1000,
        block: 10000,
        unblock: 10000,
        kill: 10000,
        ...this.overlayCommandCooldownsConfig
      },
      remoteChatTTS: this.remoteChatTTS,
      ignorePrefix: this.ignorePrefix ?? '~',
      makiConfig: {
        twitchClientId: this.makiConfig?.twitchClientId ?? '',
        twitchClientSecret: this.makiConfig?.twitchClientSecret ?? '',
        broadcasterName: this.makiConfig?.broadcasterName ?? '',
        openrouterApiKey: this.makiConfig?.openrouterApiKey ?? '',
        makiModel: this.makiConfig?.makiModel ?? 'google/gemini-2.5-flash-lite',
        evaluatorModel: this.makiConfig?.evaluatorModel ?? 'qwen/qwen3-coder-30b-a3b-instruct',
        maxTokens: this.makiConfig?.maxTokens ?? 1024,
        searchApiKey: this.makiConfig?.searchApiKey ?? '',
        communicationBusUrl: this.makiConfig?.communicationBusUrl ?? 'ws://localhost:3001/senders',
        screenshotDisplay: this.makiConfig?.screenshotDisplay ?? 1
      }
    };
  }
}

export interface FullConfig {
  channelName: string;
  commandsDisabled: boolean;
  alternativePitchControl?: AlternativePitchControl;
  voices: string[];
  pitchRange: RangeConfig;
  rateRange: RangeConfig;
  filteredExps: string[];
  soundEffects: SoundEffect[];
  standaloneSongConfig?: StandaloneSongConfig;
  remoteVoiceConfig?: RemoteVoiceConfig;
  distractConfig?: DistractConfig;
  moderationConfig?: OverlayModerationConfig;
  blackSilenceConfig?: OverlayBlackSilenceConfig;
  flashbangConfig?: OverlayFlashbangConfig;
  maxwellConfig?: OverlayMaxwellConfig;
  mistakeConfig?: OverlayMistakeConfig;
  showImageConfig?: OverlayShowImageConfig;
  playAudioConfig?: OverlayPlayAudioConfig;
  selfThoughtConfig?: OverlaySelfThoughtConfig;
  goodNightKissConfig?: OverlayGoodNightKissConfig;
  setTitleConfig?: OverlaySetTitleConfig;
  karmaConfig?: OverlayKarmaConfig;
  modelConfig?: OverlayModelConfig;
  captchaConfig?: OverlayCaptchaConfig;
  checkInConfig?: OverlayCheckInConfig;
  commandCooldownsConfig?: OverlayCommandCooldownsConfig;
  dynamicConfig: DynamicConfig;
  remoteChatTTS?: RemoteChatTTSControllerConfig;
  ignorePrefix: string;
  makiConfig: MakiConfig;
}

export function parseYaml(input: string): ParseableConfig {
  return new ParseableConfig(parse(input));
}
