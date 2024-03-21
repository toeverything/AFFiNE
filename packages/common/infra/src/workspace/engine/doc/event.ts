export type Event =
  | {
      type: 'ClientUpdateCommitted';
      clientId: string;
      docId: string;
      update: Uint8Array;
      seqNum: number;
    }
  | {
      type: 'ServerUpdateCommitted';
      docId: string;
      update: Uint8Array;
      clientId: string;
    }
  | {
      type: 'LegacyClientUpdateCommitted';
      docId: string;
      update: Uint8Array;
    };

export interface EventBus {
  emit(event: Event): void;
  on(cb: (event: Event) => void): () => void;
}

export class MemoryEventBus implements EventBus {
  listeners = new Set<(event: Event) => void>();
  emit(event: Event): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (e) {
        console.error(e);
      }
    }
  }
  on(cb: (event: Event) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }
}

export class EventBusInner implements EventBus {
  constructor(private readonly eventBusBehavior: EventBus) {}

  emit(event: Event) {
    this.eventBusBehavior.emit(event);
  }

  on(cb: (event: Event) => void) {
    return this.eventBusBehavior.on(cb);
  }
}
