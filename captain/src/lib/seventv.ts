type Emote = {
  name: string;
  urls: string[];
};

type RawEmote = {
  name: string;
  data: {
    host?: {
      url: string;
      files: {
        name: string;
      }[];
    };
  };
};

type EmoteSetResponse = {
  emotes: RawEmote[];
};

const API_ENDPOINT = 'https://7tv.io/v3/emote-sets';

const cachedEmoteLists = new Map<string, Emote[]>();
const inFlightEmoteLists = new Map<string, Promise<Emote[]>>();

async function getEmoteListCached(emoteSetId: string): Promise<Emote[]> {
  const cached = cachedEmoteLists.get(emoteSetId);
  if (cached !== undefined) {
    return cached;
  }
  const inFlight = inFlightEmoteLists.get(emoteSetId);
  if (inFlight !== undefined) {
    return inFlight;
  }

  const promise = (async () => {
    try {
      const response = await fetch(`${API_ENDPOINT}/${emoteSetId}`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result: EmoteSetResponse = await response.json();

      const emotes = result.emotes.flatMap((emote) => {
        const host = emote.data.host;
        if (host === undefined) return [];
        return [
          {
            name: emote.name,
            urls: host.files.map((file) => `${host.url}/${file.name}`)
          }
        ];
      });

      cachedEmoteLists.set(emoteSetId, emotes);
      console.log(`Loaded ${emotes.length} 7TV emotes for set ${emoteSetId}.`);
      return emotes;
    } catch (error) {
      console.error('Error fetching emote set:', error);
      return [];
    } finally {
      inFlightEmoteLists.delete(emoteSetId);
    }
  })();
  inFlightEmoteLists.set(emoteSetId, promise);
  return promise;
}

export async function is7TVEmote(emoteSetId: string, word: string): Promise<Emote | null> {
  return (await getEmoteListCached(emoteSetId)).find((e) => e.name === word) ?? null;
}
