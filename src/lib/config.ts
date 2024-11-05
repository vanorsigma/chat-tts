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

export class ParseableConfig {
  channelName?: string;
  voices?: string[];
  pitchRange?: RangeConfigOptional;
  rateRange?: RangeConfigOptional;

  constructor(arbitraryObject: any) {
    this.channelName = arbitraryObject["channelName"];
    this.voices = arbitraryObject["voices"];
    this.pitchRange = arbitraryObject["pitchRange"];
    this.rateRange = arbitraryObject["rateRange"];
  }

  toFullConfig(): FullConfig {
    return {
      channelName: this.channelName ?? '',
      voices: this.voices ?? [],
      pitchRange: {
        maximum: this.pitchRange?.maximum ?? 1.5,
        minimum: this.pitchRange?.minimum ?? 0.0,
      },
      rateRange: {
        maximum: this.pitchRange?.maximum ?? 2.0,
        minimum: this.pitchRange?.minimum ?? 0.0,
      }
    };
  }
}

export interface FullConfig {
  channelName: string;
  voices: string[];
  pitchRange: RangeConfig;
  rateRange: RangeConfig;
}

export function parseYaml(input: string): ParseableConfig {
  return new ParseableConfig(parse(input));
}
