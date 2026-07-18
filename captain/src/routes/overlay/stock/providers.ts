export type Unsubscribe = () => void;

export interface StockProvider {
  readonly symbol: string;
  readonly label: string;
  readonly icon?: string;
  readonly color?: string;
  subscribe(fn: (value: number) => void): Unsubscribe;
  get current(): number;
}

export class StockProviderRegistry {
  private providers = new Map<string, StockProvider>();

  register(provider: StockProvider): void {
    this.providers.set(provider.symbol, provider);
  }

  get(symbol: string): StockProvider | undefined {
    return this.providers.get(symbol);
  }

  getAll(): StockProvider[] {
    return Array.from(this.providers.values());
  }

  symbols(): string[] {
    return Array.from(this.providers.keys());
  }
}

export const GLOBAL_PROVIDER_REGISTRY = new StockProviderRegistry();

export function registerStock(provider: StockProvider): StockProvider {
  GLOBAL_PROVIDER_REGISTRY.register(provider);
  return provider;
}
