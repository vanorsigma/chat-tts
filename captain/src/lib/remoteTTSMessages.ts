export interface CancelTTS {
  type: 'tts';
  command: {
    type: 'cancel';
  };
}

export interface DisableTTS {
  type: 'tts';
  command: {
    type: 'disable';
    duration: number; // in seconds
  };
}

export interface SpeakTTS {
  type: 'tts';
  command: {
    type: 'speak';
    username: string;
    message: string;
    isMod: boolean;
    isVip: boolean;
  };
}

export type RemoteTTSMessages = CancelTTS | DisableTTS | SpeakTTS;

export function isRemoteTTSMessage(obj: object): obj is RemoteTTSMessages {
  return Object.keys(obj).includes('type') && (obj as RemoteTTSMessages).type === 'tts';
}
