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

interface TextSegment {
  tags: string[];
  text: string;
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

function makeTextSegments(text: string, tags: string[]): TextSegment[] {
  const segments: TextSegment[] = [];
  let currentText = '';
  let currentTags: string[] = [];
  let i = 0;

  while (i < text.length) {
    let foundTag = false;

    for (const tag of tags) {
      if (text.startsWith(tag, i)) {
        if (currentText) {
          segments.push({ tags: currentTags, text: currentText });
          currentText = '';
          currentTags = [];
        }
        currentTags.push(tag);
        i += tag.length;
        foundTag = true;
        break;
      }
    }

    if (!foundTag) {
      currentText += text[i];
      i++;
    }
  }

  if (currentText || currentTags.length > 0) {
    segments.push({ tags: currentTags, text: currentText });
  }

  return segments;
}

function breakIntoSegments(baseOptions: SpeakOptions, text: string): SpeakOptions[] {
  const soundEffectTokens = baseOptions.speakConfiguration.possibleSoundEffects.map(effect => effect.tag);
  const tags = ["[high]", "[low]", "[fast]", "[slow]", "[iden]", ...soundEffectTokens];
  const textSegments = makeTextSegments(text, tags);
  const speakOptions = [];

  for (const segment of textSegments) {
    let pitch = baseOptions.pitch;
    let rate = baseOptions.rate;
    for (const tag of segment.tags) {
      switch (tag) {
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
        default:
          speakOptions.push({
            pitch,
            rate,
            voice: baseOptions.voice,
            text: '',
            speakConfiguration: baseOptions.speakConfiguration,
            soundEffect: baseOptions.speakConfiguration.possibleSoundEffects.find(effect => effect.tag === tag)!
          })
          continue;
      }
    }
    speakOptions.push({
      pitch,
      rate,
      voice: baseOptions.voice,
      text: segment.text,
      speakConfiguration: baseOptions.speakConfiguration,
    });
  }

  return speakOptions;
}

export async function playAudio(url: string, volume: number, rate: number): Promise<void> {
  return new Promise((resolve) => {
    const audio = new Audio(url);
    audio.play();
    audio.volume = volume;
    audio.playbackRate = rate;
    audio.addEventListener('ended', () => {
      resolve();
    });
  });
}

export async function speak(options: SpeakOptions, onVoiceStart: () => void): Promise<void> {
  while (synth.speaking && currentWaiter) {
    await currentWaiter;
  }

  const segments = breakIntoSegments(options, options.text.trim());

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
          await setPitchForAlternatePitchControl(segment.pitch,
            options.speakConfiguration.alternativePitchControl!.controlURL!);
        }
        await playAudio(segment.soundEffect.filePath, 0.5, segment.rate);
        continue;
      }

      if (segment.text.trim().length == 0) {
        continue; // not a sound effect and text is empty. could just be a modifier
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
