import type { AwarenessSource, SyncAwareness } from './source.js';

export class AwarenessEngine {
  constructor(
    readonly awareness: SyncAwareness,
    readonly sources: AwarenessSource[]
  ) {}

  connect() {
    this.sources.forEach(source => source.connect(this.awareness));
  }

  disconnect() {
    this.sources.forEach(source => source.disconnect());
  }
}
