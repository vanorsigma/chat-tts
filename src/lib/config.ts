// Configuration file for the TTS bot.
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

export interface ObsSettings {
  obsURL: string;
  password: string;
  sourceName: string;
  rotationNames: string[];
}

export interface StandaloneSongConfig {
  wsUrl: string;
}

export interface DistractConfigOptional {
  wsUrl?: string;
  distractCooldown?: number;
  rotateCooldown?: number;
  distractChance?: number;
  rotateChance?: number;
}

export interface DistractConfig {
  wsUrl: string;
  distractCooldown: number;
  rotateCooldown: number;
  distractChance: number;
  rotateChance: number;
}

export interface RemoteVoiceConfig {
  controlURL: string;
}

// For anything adjustable from the UI
export interface DynamicConfig {
  songPitchSpeedAffected: boolean;
}

export class ConfigParsingError extends Error {}

export class ParseableConfig {
  channelName?: string;
  commandsDisabled: boolean;
  obsSettings?: ObsSettings;
  alternativePitchControl?: AlternativePitchControl;
  voices?: string[];
  pitchRange?: RangeConfigOptional;
  rateRange?: RangeConfigOptional;
  filteredExps?: string[];
  soundEffects?: SoundEffect[];
  standaloneSongConfig?: StandaloneSongConfig;
  remoteVoiceConfig?: RemoteVoiceConfig;
  distractConfig?: DistractConfigOptional;
  ignorePrefix?: string;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(arbitraryObject: any) {
    const nonOptionalFields = ['channelName', 'commandsDisabled'];

    for (const field of nonOptionalFields) {
      if (!Object.hasOwn(arbitraryObject, field)) {
        throw new ConfigParsingError(`Field ${field} is missing from the config, cannot continue`);
      }
    }

    this.channelName = arbitraryObject['channelName'];
    this.commandsDisabled = arbitraryObject['commandsDisabled'] ?? false;
    this.obsSettings = this.verifyObsSettings(arbitraryObject);
    this.alternativePitchControl = arbitraryObject['alternativePitchControl'];
    this.voices = arbitraryObject['voices'];
    this.pitchRange = arbitraryObject['pitchRange'];
    this.rateRange = arbitraryObject['rateRange'];
    this.filteredExps = arbitraryObject['filteredExps'];
    this.soundEffects = arbitraryObject['soundEffects'];
    this.standaloneSongConfig = arbitraryObject['standaloneSongConfig'];
    this.remoteVoiceConfig = arbitraryObject['remoteVoiceConfig'];
    this.distractConfig = arbitraryObject['distractConfig'];
    this.ignorePrefix = arbitraryObject['ignorePrefix'] ?? '~';
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private verifyObsSettings(arbitrary: any): ObsSettings | undefined {
    if (
      arbitrary['obsSettings'] &&
      arbitrary['obsSettings']['obsURL'] &&
      arbitrary['obsSettings']['password'] &&
      arbitrary['obsSettings']['sourceName'] &&
      arbitrary['obsSettings']['rotationNames']
    ) {
      return arbitrary['obsSettings'] as ObsSettings;
    }
    return undefined;
  }

  toFullConfig(): FullConfig {
    return {
      channelName: this.channelName ?? '',
      commandsDisabled: this.commandsDisabled,
      voices: this.voices ?? [],
      obsSettings: this.obsSettings,
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
        wsUrl: '',
        distractCooldown: 900,
        rotateCooldown: 300,
        distractChance: 0.001,
        rotateChance: 0.01,
        ...this.distractConfig,
      },
      ignorePrefix: this.ignorePrefix ?? '~',
    };
  }
}

export interface FullConfig {
  channelName: string;
  commandsDisabled: boolean;
  obsSettings?: ObsSettings;
  alternativePitchControl?: AlternativePitchControl;
  voices: string[];
  pitchRange: RangeConfig;
  rateRange: RangeConfig;
  filteredExps: string[];
  soundEffects: SoundEffect[];
  standaloneSongConfig?: StandaloneSongConfig;
  remoteVoiceConfig?: RemoteVoiceConfig;
  distractConfig?: DistractConfig;
  dynamicConfig: DynamicConfig;
  ignorePrefix: string;
}

export function parseYaml(input: string): ParseableConfig {
  return new ParseableConfig(parse(input));
}
