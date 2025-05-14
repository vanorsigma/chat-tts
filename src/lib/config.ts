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

export interface DistractConfig {
  wsUrl: string;
  cooldown: number;
}

export interface RemoteVoiceConfig {
  controlURL: string;
}

// For anything adjustable from the UI
export interface DynamicConfig {
  songPitchSpeedAffected: boolean;
}

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
  distractConfig?: DistractConfig;

  constructor(arbitraryObject: any) {
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
    this.distractConfig = arbitraryObject['distractConfig'];
  }

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
        songPitchSpeedAffected: true
      },
      distractConfig: this.distractConfig,
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
}

export function parseYaml(input: string): ParseableConfig {
  return new ParseableConfig(parse(input));
}
