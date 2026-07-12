/**
 * Kiki API
 */

export interface KikiResponse {
  kamoji: string;
  emoji: string;
  rating: number;
}

export class KikiAPI {
  private apiurl: string;

  constructor(apiurl: string) {
    this.apiurl = apiurl;
  }

  async fetchKikiResponse(message: string): Promise<KikiResponse | null> {
    const response = await fetch(`${this.apiurl}/?` + new URLSearchParams({
      'message': message
    }).toString());

    if (response.status !== 200) {
      console.error('Kiki did not respond');
      return null;
    }

    return await response.json();
  }
}
