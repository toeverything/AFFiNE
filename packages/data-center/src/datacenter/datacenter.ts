import { DCProvider, MemoryProvider } from './provider.js';

export class DataCenter {
  private readonly _providers = new Map<string, DCProvider>();

  static async init() {
    const dc = new DataCenter();
    dc.addProvider(MemoryProvider);
  }

  private constructor() {
    // TODO
  }

  addProvider<P extends DCProvider>(provider: P) {
    this._providers.set(provider.id, provider);
  }
}
