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

export interface ObsSettings {
  obsURL: string,
  password: string,
  sourceName: string,
}

export class ParseableConfig {
  channelName?: string;
  obsSettings?: ObsSettings;
  voices?: string[];
  pitchRange?: RangeConfigOptional;
  rateRange?: RangeConfigOptional;
  filteredExps?: string[];

  constructor(arbitraryObject: any) {
    this.channelName = arbitraryObject["channelName"];
    this.obsSettings = this.verifyObsSettings(arbitraryObject);
    this.voices = arbitraryObject["voices"];
    this.pitchRange = arbitraryObject["pitchRange"];
    this.rateRange = arbitraryObject["rateRange"];
    this.filteredExps = arbitraryObject["filteredExps"];
  }

  private verifyObsSettings(arbitrary: any): ObsSettings | undefined {
    if (arbitrary["obsSettings"] && arbitrary["obsSettings"]["obsURL"] && arbitrary["obsSettings"]["password"] && arbitrary["obsSettings"]["sourceName"]) {
      return arbitrary["obsSettings"] as ObsSettings;
    }
    return undefined;
  }

  toFullConfig(): FullConfig {
    return {
      channelName: this.channelName ?? '',
      voices: this.voices ?? [],
      obsSettings: this.obsSettings,
      pitchRange: {
        maximum: this.pitchRange?.maximum ?? 1.5,
        minimum: this.pitchRange?.minimum ?? 0.0,
      },
      rateRange: {
        maximum: this.pitchRange?.maximum ?? 2.0,
        minimum: this.pitchRange?.minimum ?? 0.0,
      },
      filteredExps: this.filteredExps ?? [],
    };
  }
}

export interface FullConfig {
  channelName: string;
  obsSettings?: ObsSettings;
  voices: string[];
  pitchRange: RangeConfig;
  rateRange: RangeConfig;
  filteredExps: string[];
}

export function parseYaml(input: string): ParseableConfig {
  return new ParseableConfig(parse(input));
}
