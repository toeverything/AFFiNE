import { createIdentifier } from '../../di';

export interface AwarenessProvider {
  connect(): void;
  disconnect(): void;
}

export const AwarenessProvider =
  createIdentifier<AwarenessProvider>('AwarenessProvider');

export class AwarenessEngine {
  constructor(public readonly providers: AwarenessProvider[]) {}

  static get EMPTY() {
    return new AwarenessEngine([]);
  }

  connect() {
    this.providers.forEach(provider => provider.connect());
  }

  disconnect() {
    this.providers.forEach(provider => provider.disconnect());
  }
}
