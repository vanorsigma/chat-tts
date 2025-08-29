type Emote = {
  id: string;
  name: string;
  urls: string[];
};

type EmoteSetResponse = {
  data: {
    emoteSet: {
      emotes: {
        id: string;
        name: string;
        data: {
          name: string;
          host: {
            url: string;
            files: {
              format: string;
              name: string;
            }[];
          };
        };
      }[];
    };
  };
};

const GRAPHQL_ENDPOINT = 'https://7tv.io/v3/gql';

export async function is7TVEmote(emoteSetId: string, word: string): Promise<Emote | null> {
  const query = `
    query GetEmoteSet($id: String!) {
      emoteSet(id: $id) {
        emotes {
          id
          name
          data {
            name
            host {
              url
              files {
                format
                name
              }
            }
          }
        }
      }
    }
  `;

  const variables = { id: emoteSetId };

  try {
    const response = await fetch(GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result: EmoteSetResponse = await response.json();

    const emote = result.data.emoteSet.emotes.find((e) => e.name === word);

    if (emote) {
      return {
        id: emote.id,
        name: emote.name,
        urls: emote.data.host.files.map(file => `${emote.data.host.url}/${file.name}`),
      };
    }

    return null;
  } catch (error) {
    console.error('Error fetching emote set:', error);
    return null;
  }
}
