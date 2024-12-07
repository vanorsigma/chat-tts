// Mostly copied from this example:
// https://github.com/mdn/dom-examples/blob/main/web-speech-api/speak-easy-synthesis/script.js

import type { AlternativePitchControl, SoundEffect } from "./config";

const synth = window.speechSynthesis;
let currentWaiter: Promise<void> | null = null;
let cancellation: (() => void) | null = null;

interface SpeakConfiguration {
  alternativePitchControl?: AlternativePitchControl;
  possibleSoundEffects: SoundEffect[];
}

interface SpeakOptions {
  text: string;
  voice: SpeechSynthesisVoice;
  pitch: number;
  rate: number;
  soundEffect?: SoundEffect;
  speakConfiguration: SpeakConfiguration;
}

export async function setPitchForAlternatePitchControl(pitch: number, controlURL: string) {
  const clampedPitch = Math.max(0.75, Math.min(1.5, pitch));
  return fetch(controlURL + `?pitch=${clampedPitch}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

export function getVoicesList(): SpeechSynthesisVoice[] {
  return synth.getVoices().sort(function (a, b) {
    const aname = a.name.toUpperCase();
    const bname = b.name.toUpperCase();

    if (aname < bname) {
      return -1;
    } else if (aname == bname) {
      return 0;
    } else {
      return +1;
    }
  });
}

export function selectVoiceByName(name: string): SpeechSynthesisVoice | undefined {
  return synth.getVoices().find(voice => voice.name === name);
}

function startsWithOneOf(text: string, tokens: string[]): string | null {
  const trimmedText = text.trimStart();
  return tokens.filter(token => trimmedText.startsWith(token)).at(0) ?? null;
}

function getIndexOfNextMatch(text: string, tokens: string[]): number {
  let lowestIndex = text.length;

  for (const token of tokens) {
    const location = text.indexOf(token);
    if (location == -1) continue;

    lowestIndex = Math.min(location, lowestIndex);
  }
  return lowestIndex;
}

function processNextSegment(baseOptions: SpeakOptions, text: string): [SpeakOptions, string] {
  const soundEffectTokens = baseOptions.speakConfiguration.possibleSoundEffects.map(effect => effect.tag);
  const tokens = ["[high]", "[low]", "[fast]", "[slow]", "[iden]", ...soundEffectTokens];
  const modifiers: string[] = [];
  let matchedToken = startsWithOneOf(text, tokens);
  if (!matchedToken) {
    return [baseOptions, ''];
  }

  while (matchedToken) {
    modifiers.push(matchedToken);
    text = text.replace(matchedToken, '');
    matchedToken = startsWithOneOf(text, tokens);
  }
  text = text.replace(matchedToken!, '');
  const textEndLocation = getIndexOfNextMatch(text, tokens);

  let pitch = baseOptions.pitch;
  let rate = baseOptions.rate;

  for (const modifier of modifiers) {
    if (soundEffectTokens.includes(modifier)) {
      return [{
        pitch,
        rate,
        voice: baseOptions.voice,
        text: '',
        speakConfiguration: baseOptions.speakConfiguration,
        soundEffect: baseOptions.speakConfiguration.possibleSoundEffects.find(effect => effect.tag === modifier)!
      }, ''];
    }

    switch (modifier) {
      case "[high]":
        pitch *= 1.05;
        break;
      case "[low]":
        pitch *= 0.95;
        break;
      case "[fast]":
        rate *= 1.05;
        break;
      case "[slow]":
        rate *= 0.95;
        break;
      case "[iden]":
        pitch *= 1;
        rate *= 1;
        break;
    }
  }

  return [{
    pitch,
    rate,
    voice: baseOptions.voice,
    text: text.substring(0, textEndLocation).trim(),
    speakConfiguration: baseOptions.speakConfiguration,
  }, text.substring(textEndLocation).trim()];

}

export async function speak(options: SpeakOptions, onVoiceStart: () => void): Promise<void> {
  while (synth.speaking && currentWaiter) {
    await currentWaiter;
  }

  let [segment, remaining] = processNextSegment(options, '[iden]' + options.text.trim());
  let segments: SpeakOptions[] = [segment];
  while (remaining.trim().length > 0) {
    [segment, remaining] = processNextSegment(options, remaining);
    segments = [...segments, segment];
  }

  let doOnce = () => {
    onVoiceStart();
    doOnce = () => {};
  }

  cancellation = () => {
    synth.cancel();
    cancellation = null;
  };

  currentWaiter = async function () {
    for (const segment of segments) {
      // if the cancellation was unassigned, it means that we've consumed it
      if (cancellation == null) {
        return;
      }

      // if it's a sound effect, we can play immediately
      if (segment.soundEffect) {
        if (options.speakConfiguration.alternativePitchControl?.controlURL ?? '') {
          await setPitchForAlternatePitchControl(1.0, options.speakConfiguration.alternativePitchControl!.controlURL!);
        }
        const audio = new Audio(segment.soundEffect.filePath);
        audio.play();
        continue;
      }

      const utterThis = new SpeechSynthesisUtterance(segment.text);
      await new Promise((resolve) => {
        utterThis.onend = () => {
          // NOTE: Disabled, because there isn't really a point to reset pitch
          // if (options.alternativePitchControl?.controlURL ?? '') {
          //   setPitchForAlternatePitchControl(1.0, options.alternativePitchControl!.controlURL!);
          // }
          resolve(0);
        }
        utterThis.onerror = () => resolve(0);

        utterThis.voice = options.voice;
        if (options.speakConfiguration.alternativePitchControl?.controlURL ?? '') {
          utterThis.pitch = 1.0;
          const controlUrl = options.speakConfiguration.alternativePitchControl!.controlURL!;
          setPitchForAlternatePitchControl(segment.pitch, controlUrl);
        } else {
          utterThis.pitch = Math.max(0.0, segment.pitch);
        }
        utterThis.rate = Math.max(0.0, segment.rate);
        doOnce();
        synth.speak(utterThis);
      });
    }
  }();

  return currentWaiter;
}

export async function cancelSpeech() {
  if (cancellation) {
    cancellation();
  }
}
