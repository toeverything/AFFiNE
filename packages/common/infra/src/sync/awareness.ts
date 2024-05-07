export interface AwarenessConnection {
  connect(): void;
  disconnect(): void;
}

export class AwarenessEngine {
  constructor(public readonly connections: AwarenessConnection[]) {}

  connect() {
    this.connections.forEach(connection => connection.connect());
  }

  disconnect() {
    this.connections.forEach(connection => connection.disconnect());
  }
}
