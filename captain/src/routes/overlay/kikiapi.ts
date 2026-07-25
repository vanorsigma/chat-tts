/**
 * Kiki API
 */

export interface KikiResponse {
  kamoji: string;
  emoji: string;
  rating: number;
  pin_worthy: boolean;
}

export class KikiAPI {
  private apiurl: string;

  constructor(apiurl: string) {
    this.apiurl = apiurl;
  }

  async fetchKikiResponse(username: string, message: string): Promise<KikiResponse | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30_000);

    try {
      const response = await fetch(
        `${this.apiurl}/?` +
          new URLSearchParams({
            message: `${username}: ${message}`
          }).toString(),
        { signal: controller.signal }
      );

      if (response.status !== 200) {
        console.error('Kiki did not respond');
        return null;
      }

      return await response.json();
    } catch (e) {
      console.error('Kiki timed out or errored', e);
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
