import { type DBSchema, openDB } from 'idb';

import type { TelemetryEvent } from './types';

interface TelemetryQueueDB extends DBSchema {
  events: {
    key: number;
    value: {
      id?: number;
      event: TelemetryEvent;
      size: number;
      addedAt: number;
    };
  };
}

export type TelemetryQueueItem = {
  id: number;
  event: TelemetryEvent;
  size: number;
  addedAt: number;
};

export class TelemetryQueue {
  private readonly dbPromise = openDB<TelemetryQueueDB>('affine-telemetry', 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('events')) {
        db.createObjectStore('events', { keyPath: 'id', autoIncrement: true });
      }
    },
  });

  private readonly ready = this.load();
  private items: TelemetryQueueItem[] = [];
  private totalSize = 0;

  constructor(
    private readonly maxEntries: number,
    private readonly maxBytes: number
  ) {}

  get size() {
    return this.items.length;
  }

  async enqueue(event: TelemetryEvent) {
    await this.ready;
    const size = estimateSize(event);
    const addedAt = Date.now();
    const db = await this.dbPromise;
    const id = await db.add('events', { event, size, addedAt });
    const item = { id: Number(id), event, size, addedAt };
    this.items.push(item);
    this.totalSize += size;
    await this.enforceLimits();
  }

  async peek(limit: number) {
    await this.ready;
    return this.items.slice(0, limit);
  }

  async remove(ids: number[]) {
    await this.ready;
    if (!ids.length) {
      return;
    }

    const db = await this.dbPromise;
    const tx = db.transaction('events', 'readwrite');
    await Promise.all(ids.map(id => tx.store.delete(id)));
    await tx.done;

    const removeSet = new Set(ids);
    this.items = this.items.filter(item => {
      if (removeSet.has(item.id)) {
        this.totalSize -= item.size;
        return false;
      }
      return true;
    });
  }

  private async load() {
    const db = await this.dbPromise;
    const all = await db.getAll('events');
    this.items = all
      .filter(item => typeof item.id === 'number')
      .map(item => ({
        id: item.id as number,
        event: item.event,
        size: item.size,
        addedAt: item.addedAt,
      }))
      .sort((a, b) => a.id - b.id);
    this.totalSize = this.items.reduce((sum, item) => sum + item.size, 0);
  }

  private async enforceLimits() {
    if (
      this.items.length <= this.maxEntries &&
      this.totalSize <= this.maxBytes
    ) {
      return;
    }

    const db = await this.dbPromise;
    const tx = db.transaction('events', 'readwrite');
    const deletions: Promise<unknown>[] = [];
    while (
      this.items.length > this.maxEntries ||
      this.totalSize > this.maxBytes
    ) {
      const removed = this.items.shift();
      if (!removed) {
        break;
      }
      this.totalSize -= removed.size;
      deletions.push(tx.store.delete(removed.id));
    }
    await Promise.all(deletions);
    await tx.done;
  }
}

function estimateSize(event: TelemetryEvent) {
  try {
    return JSON.stringify(event).length;
  } catch {
    return 0;
  }
}
