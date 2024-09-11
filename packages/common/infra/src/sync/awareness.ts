import type { Awareness } from 'y-protocols/awareness.js';

export interface AwarenessConnection {
  connect(awareness: Awareness): void;
  disconnect(): void;
  dispose?(): void;
}

export class AwarenessEngine {
  constructor(public readonly connections: AwarenessConnection[]) {}

  connect(awareness: Awareness) {
    this.connections.forEach(connection => connection.connect(awareness));
  }

  disconnect() {
    this.connections.forEach(connection => connection.disconnect());
  }

  dispose() {
    this.connections.forEach(connection => connection.dispose?.());
  }
}
