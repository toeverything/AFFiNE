import { type AwarenessClientRotator, YOctoDocSession } from './doc-session.js';
import {
  generateSafeClientId,
  getYOctoTapeSync,
  type YOctoBinaryTape,
} from './runtime.js';
import type { AwarenessChangeEvent, AwarenessStateEntry } from './types.js';

type AwarenessEventMap = {
  change: [changes: AwarenessChangeEvent, origin: unknown];
  update: [changes: AwarenessChangeEvent, origin: unknown];
  destroy: [];
};

type AwarenessEventName = keyof AwarenessEventMap;
type AnyListener = (...args: any[]) => void;

export class YOctoAwarenessSession implements AwarenessClientRotator {
  readonly doc: { readonly guid: string };
  private readonly tape: YOctoBinaryTape;
  private handle: number;
  private _clientID: number;
  private readonly listeners = new Map<AwarenessEventName, Set<AnyListener>>();
  private readonly detachFromDoc?: () => void;
  private destroyed = false;

  constructor(
    doc: YOctoDocSession | { readonly guid: string; readonly clientID?: number }
  ) {
    this.tape = getYOctoTapeSync();
    this.doc = doc;
    this._clientID = doc.clientID ?? generateSafeClientId();
    const handle = this.tape.exp.awareness_create(BigInt(this._clientID));
    if (!handle) {
      throw new Error(this.tape.readError() || 'awareness_create failed');
    }
    this.handle = handle;
    if (doc instanceof YOctoDocSession) {
      this.detachFromDoc = doc.attachAwareness(this);
    }
  }

  get clientID(): number {
    return this._clientID;
  }

  on<K extends AwarenessEventName>(
    event: K,
    listener: (...args: AwarenessEventMap[K]) => void
  ): void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as AnyListener);
  }

  off<K extends AwarenessEventName>(
    event: K,
    listener: (...args: AwarenessEventMap[K]) => void
  ): void {
    this.listeners.get(event)?.delete(listener as AnyListener);
  }

  once<K extends AwarenessEventName>(
    event: K,
    listener: (...args: AwarenessEventMap[K]) => void
  ): void {
    const wrapper = (...args: AwarenessEventMap[K]) => {
      this.off(event, wrapper);
      listener(...args);
    };
    this.on(event, wrapper);
  }

  private emit<K extends AwarenessEventName>(
    event: K,
    args: AwarenessEventMap[K]
  ): void {
    const set = this.listeners.get(event);
    if (!set || set.size === 0) {
      return;
    }
    for (const listener of Array.from(set)) {
      listener(...args);
    }
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.detachFromDoc?.();
    this.emit('destroy', []);
    this.listeners.clear();
    this.free();
  }

  free(): void {
    if (this.handle) {
      this.tape.exp.awareness_free(this.handle);
      this.handle = 0;
    }
  }

  localId(): number {
    if (!this.handle) {
      return this._clientID;
    }
    return Number(this.tape.exp.awareness_local_id(this.handle));
  }

  setLocalId(
    newLocalId: number,
    origin: unknown = 'local'
  ): AwarenessChangeEvent {
    if (!this.handle) {
      throw new Error('AwarenessSession has been destroyed');
    }
    this.tape.checkOk(
      this.tape.exp.awareness_set_local_id(this.handle, BigInt(newLocalId))
    );
    this._clientID = newLocalId;
    this.tape.rStart();
    const ev = this.tape.rAwarenessEvent();
    this.emitChanges(ev, origin);
    return ev;
  }

  setLocalState(state: Record<string, unknown> | null): void {
    if (!this.handle) {
      throw new Error('AwarenessSession has been destroyed');
    }
    const prevRaw = this.getRawStates().get(this._clientID);
    const hadPrev = prevRaw !== undefined && !prevRaw.deleted;

    if (state === null) {
      this.tape.checkOk(this.tape.exp.awareness_clear_local_state(this.handle));
      if (hadPrev) {
        this.emitChanges(
          { added: [], updated: [], removed: [this._clientID] },
          'local'
        );
      }
      return;
    }

    const jsonString = JSON.stringify(state);
    this.tape.withInputFrame(jsonString.length * 3 + 16, () => {
      const len = this.tape.writeUtf8Raw(jsonString, this.tape.inPtr);
      this.tape.wPos = this.tape.inPtr + len;
      this.tape.checkOk(
        this.tape.exp.awareness_set_local_state(this.handle, len)
      );
    });
    this.emitChanges(
      hadPrev
        ? { added: [], updated: [this._clientID], removed: [] }
        : { added: [this._clientID], updated: [], removed: [] },
      'local'
    );
  }

  setLocalStateField(field: string, value: unknown): void {
    const current = this.getLocalState() ?? {};
    this.setLocalState({
      ...current,
      [field]: value,
    });
  }

  getLocalState(): Record<string, unknown> | null {
    return this.getStates().get(this._clientID) ?? null;
  }

  getRawStates(): Map<number, AwarenessStateEntry> {
    if (!this.handle) {
      return new Map();
    }
    this.tape.checkOk(this.tape.exp.awareness_get_states(this.handle));
    this.tape.rStart();
    const count = this.tape.rU32();
    const map = new Map<number, AwarenessStateEntry>();
    for (let i = 0; i < count; i++) {
      const id = this.tape.rU64();
      const clock = this.tape.rU64();
      const content = this.tape.rStr();
      const deleted = this.tape.rU32() !== 0;
      map.set(id, { clock, content, deleted });
    }
    return map;
  }

  getStates(): Map<number, Record<string, unknown>> {
    const raw = this.getRawStates();
    const out = new Map<number, Record<string, unknown>>();
    for (const [clientId, entry] of raw) {
      if (entry.deleted || !entry.content) {
        continue;
      }
      try {
        const parsed = JSON.parse(entry.content);
        if (parsed && typeof parsed === 'object') {
          out.set(clientId, parsed as Record<string, unknown>);
        }
      } catch {
        // ignore malformed state json
      }
    }
    return out;
  }

  encodeUpdate(clients?: number[]): Uint8Array {
    if (!this.handle) {
      throw new Error('AwarenessSession has been destroyed');
    }
    if (clients === undefined) {
      this.tape.checkOk(
        this.tape.exp.awareness_encode_update(this.handle, 0, 0)
      );
      return this.tape.readRawOutBytes();
    }
    if (clients.length === 0) {
      this.tape.checkOk(
        this.tape.exp.awareness_encode_update(this.handle, 1, 0)
      );
      return this.tape.readRawOutBytes();
    }
    const list = Array.from(clients, client => Number(client));
    return this.tape.withInputFrame(list.length * 8, () => {
      for (const client of list) {
        this.tape.wU64(client);
      }
      this.tape.checkOk(
        this.tape.exp.awareness_encode_update(this.handle, 1, list.length)
      );
      return this.tape.readRawOutBytes();
    });
  }

  applyUpdate(update: Uint8Array, origin?: unknown): AwarenessChangeEvent {
    if (!this.handle) {
      throw new Error('AwarenessSession has been destroyed');
    }
    const src = update instanceof Uint8Array ? update : new Uint8Array(update);
    const ev = this.tape.withInputFrame(src.length, () => {
      this.tape.u8.set(src, this.tape.inPtr);
      this.tape.wPos = this.tape.inPtr + src.length;
      this.tape.checkOk(
        this.tape.exp.awareness_apply_update_v1(this.handle, src.length)
      );
      this.tape.rStart();
      return this.tape.rAwarenessEvent();
    });
    this.emitChanges(ev, origin);
    return ev;
  }

  private emitChanges(ev: AwarenessChangeEvent, origin: unknown): void {
    if (
      ev.added.length === 0 &&
      ev.updated.length === 0 &&
      ev.removed.length === 0
    ) {
      return;
    }
    this.emit('update', [ev, origin]);
    this.emit('change', [ev, origin]);
  }
}

export { YOctoAwarenessSession as AwarenessSession };
