// Mostly copied from this example:
// https://github.com/mdn/dom-examples/blob/main/web-speech-api/speak-easy-synthesis/script.js

const synth = window.speechSynthesis;
let currentWaiter: Promise<void> | null = null;

interface SpeakOptions {
  text: string
  voice: SpeechSynthesisVoice
  pitch: number
  rate: number
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

export async function speak(options: SpeakOptions, onVoiceStart: () => void): Promise<void> {
  while (synth.speaking && currentWaiter) {
    await currentWaiter;
  }

  let textLower = options.text.toLowerCase();
  let pitch = options.pitch;
  let rate = options.rate;
  while (textLower.includes('[high]')) {
    pitch *= 1.5;
    textLower = textLower.replace('[high]', '');
  }

  while (textLower.includes('[low]')) {
    pitch *= 0.5;
    textLower = textLower.replace('[low]', '');
  }

  while (textLower.includes('[fast]')) {
    rate *= 1.5;
    textLower = textLower.replace('[fast]', '');
  }

  while (textLower.includes('[slow]')) {
    rate *= 0.5;
    textLower = textLower.replace('[slow]', '');
  }

  const utterThis = new SpeechSynthesisUtterance(textLower);

  currentWaiter = new Promise((resolve) => {
    utterThis.onend = () => resolve();
    utterThis.onerror = () => resolve();

    utterThis.voice = options.voice;
    utterThis.pitch = Math.max(0.0, pitch);
    utterThis.rate = Math.max(0.0, rate);
    onVoiceStart();
    synth.speak(utterThis);
  });
  return currentWaiter;
}
