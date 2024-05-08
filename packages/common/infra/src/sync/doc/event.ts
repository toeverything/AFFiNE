export type DocEvent =
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
    };

export interface DocEventBus {
  emit(event: DocEvent): void;
  on(cb: (event: DocEvent) => void): () => void;
}

export class MemoryDocEventBus implements DocEventBus {
  listeners = new Set<(event: DocEvent) => void>();
  emit(event: DocEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (e) {
        console.error(e);
      }
    }
  }
  on(cb: (event: DocEvent) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }
}

export class DocEventBusInner implements DocEventBus {
  constructor(private readonly eventBusBehavior: DocEventBus) {}

  emit(event: DocEvent) {
    this.eventBusBehavior.emit(event);
  }

  on(cb: (event: DocEvent) => void) {
    return this.eventBusBehavior.on(cb);
  }
}
