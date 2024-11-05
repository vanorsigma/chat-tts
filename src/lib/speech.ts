// Mostly copied from this example:
// https://github.com/mdn/dom-examples/blob/main/web-speech-api/speak-easy-synthesis/script.js

const synth = window.speechSynthesis;

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

export async function speak(options: SpeakOptions): Promise<void> {
  if (synth.speaking) {
    return;
  }

  const utterThis = new SpeechSynthesisUtterance(options.text);

  return new Promise((resolve) => {
    utterThis.onend = () => resolve();
    utterThis.onerror = () => resolve();

    utterThis.voice = options.voice;
    utterThis.pitch = options.pitch;
    utterThis.rate = options.rate;
    synth.speak(utterThis);
  });
}
