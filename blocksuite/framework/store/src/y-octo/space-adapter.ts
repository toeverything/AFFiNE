import {
  type SessionCommit,
  type SessionReadValue,
  type SessionTxOrigin,
  type SessionValue,
  type TextDeltaOp,
  type TypeIdentity,
  type TypeTarget,
  YOctoDocSession,
} from '@blocksuite/sync/y-octo';
import * as Y from 'yjs';

import { NATIVE_UNIQ_IDENTIFIER } from '../consts.js';
import type { DeltaOperation } from '../reactive/text/types.js';

export type DocEngineType = 'yjs' | 'y-octo';

export interface YOctoRelativePosition {
  readonly bytes: Uint8Array;
  readonly __yoctoRelPos: true;
}

export function isYOctoRelativePosition(
  value: unknown
): value is YOctoRelativePosition {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as YOctoRelativePosition).__yoctoRelPos === true &&
    (value as YOctoRelativePosition).bytes instanceof Uint8Array
  );
}

export const Y_OCTO_UNDO_ORIGIN = Object.freeze({
  force: true,
  proxy: true,
  isYOctoUndoRedo: true,
});

const LAZY_SENTINEL = Symbol('yocto_lazy_value');
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function encodeMetaBytes(data: unknown): Uint8Array {
  return textEncoder.encode(JSON.stringify(data));
}

export function decodeMetaBytes(bytes: Uint8Array): unknown {
  return JSON.parse(textDecoder.decode(bytes));
}

export function identityKey(id: TypeIdentity): string {
  if ('Root' in id) {
    return `R:${id.Root}`;
  }
  return `I:${id.Item.client}:${id.Item.clock}`;
}

export function deltaOpsToYjs(ops: TextDeltaOp[]): DeltaOperation[] {
  const out: DeltaOperation[] = [];
  for (const op of ops) {
    if ('insert' in op) {
      if (typeof op.insert === 'string') {
        out.push(
          op.format
            ? { insert: op.insert, attributes: op.format }
            : { insert: op.insert }
        );
      } else if (Array.isArray(op.insert)) {
        for (const item of op.insert) {
          out.push(
            op.format
              ? { insert: item as any, attributes: op.format }
              : { insert: item as any }
          );
        }
      } else {
        out.push(
          op.format
            ? { insert: op.insert as any, attributes: op.format }
            : { insert: op.insert as any }
        );
      }
    } else if ('retain' in op) {
      out.push(
        op.format
          ? { retain: op.retain, attributes: op.format }
          : { retain: op.retain }
      );
    } else if ('delete' in op) {
      out.push({ delete: op.delete });
    }
  }
  return out;
}

export function yjsDeltaToOps(delta: DeltaOperation[]): TextDeltaOp[] {
  const out: TextDeltaOp[] = [];
  for (const op of delta) {
    if (op.insert !== undefined) {
      const format =
        op.attributes && Object.keys(op.attributes).length > 0
          ? (op.attributes as Record<string, unknown>)
          : undefined;
      if (typeof op.insert === 'string') {
        out.push(
          format ? { insert: op.insert, format } : { insert: op.insert }
        );
      } else {
        out.push(
          format
            ? {
                insert: op.insert as unknown[] | Record<string, unknown>,
                format,
              }
            : { insert: op.insert as unknown[] | Record<string, unknown> }
        );
      }
    } else if (op.retain !== undefined) {
      const format =
        op.attributes && Object.keys(op.attributes).length > 0
          ? (op.attributes as Record<string, unknown>)
          : undefined;
      out.push(format ? { retain: op.retain, format } : { retain: op.retain });
    } else if (op.delete !== undefined) {
      out.push({ delete: op.delete });
    }
  }
  return out;
}

function isPurePlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function readDetachedYValue(value: Y.AbstractType<any>): unknown {
  if (value.doc) {
    return value;
  }
  const scratch = new Y.Doc();
  scratch.getMap('__scratch').set('v', value);
  return value;
}

/**
 * Convert any JS / BlockSuite / Yjs value into a binary-tape `SessionValue`
 * for single-call atomic writes into `YOctoDocSession`.
 */
export function jsValueToSessionValue(val: unknown): SessionValue {
  if (val === null || val === undefined) {
    return { Any: val };
  }
  if (
    typeof val === 'string' ||
    typeof val === 'number' ||
    typeof val === 'boolean' ||
    typeof val === 'bigint' ||
    val instanceof Uint8Array
  ) {
    return { Any: val };
  }

  // YOcto handles (copy/clone semantics if re-inserted)
  if (isYOctoMapHandle(val)) {
    const entries: [string, SessionValue][] = [];
    val.forEach((v, k) => {
      entries.push([k, jsValueToSessionValue(v)]);
    });
    return { Map: entries };
  }
  if (isYOctoArrayHandle(val)) {
    return { Array: val.toArray().map(jsValueToSessionValue) };
  }
  if (isYOctoTextHandle(val)) {
    return { Text: yjsDeltaToOps(val.toDelta()) };
  }

  // BlockSuite Text wrapper (duck-typed to avoid circular import)
  if (
    typeof val === 'object' &&
    typeof (val as { getPendingDelta?: () => DeltaOperation[] | undefined })
      .getPendingDelta === 'function' &&
    'yText' in val
  ) {
    const textWrapper = val as {
      getPendingDelta: () => DeltaOperation[] | undefined;
      toDelta: () => DeltaOperation[];
      yText: Y.Text | YOctoTextHandle;
    };
    const pending = textWrapper.getPendingDelta();
    if (pending !== undefined) {
      return { Text: yjsDeltaToOps(pending) };
    }
    if (isYOctoTextHandle(textWrapper.yText)) {
      return { Text: yjsDeltaToOps(textWrapper.yText.toDelta()) };
    }
    readDetachedYValue(textWrapper.yText);
    return { Text: yjsDeltaToOps(textWrapper.yText.toDelta()) };
  }

  // BlockSuite Boxed wrapper (duck-typed to avoid circular import)
  if (
    typeof val === 'object' &&
    typeof (val as { getInitialValue?: () => { has: boolean; value: unknown } })
      .getInitialValue === 'function' &&
    'yMap' in val
  ) {
    const boxedWrapper = val as unknown as {
      getInitialValue: () => { has: boolean; value: unknown };
      getValue: () => unknown;
    };
    const init = boxedWrapper.getInitialValue();
    const inner = init.has ? init.value : boxedWrapper.getValue();
    return {
      Map: [
        ['type', { Any: NATIVE_UNIQ_IDENTIFIER }],
        ['value', jsValueToSessionValue(inner)],
      ],
    };
  }

  // Detached or attached Yjs containers
  if (val instanceof Y.Text) {
    readDetachedYValue(val);
    return { Text: yjsDeltaToOps(val.toDelta()) };
  }
  if (val instanceof Y.Array) {
    readDetachedYValue(val);
    return { Array: val.toArray().map(jsValueToSessionValue) };
  }
  if (val instanceof Y.Map) {
    readDetachedYValue(val);
    const entries: [string, SessionValue][] = [];
    val.forEach((v, k) => {
      entries.push([k, jsValueToSessionValue(v)]);
    });
    return { Map: entries };
  }

  if (Array.isArray(val)) {
    return { Array: val.map(jsValueToSessionValue) };
  }
  if (isPurePlainObject(val)) {
    const entries: [string, SessionValue][] = [];
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) {
        entries.push([k, jsValueToSessionValue(v)]);
      }
    }
    return { Map: entries };
  }

  return { Any: val };
}

export interface YTransactionLike {
  readonly local: boolean;
  readonly origin: any;
  readonly doc: YOctoSpaceDoc;
  readonly commit?: SessionCommit;
}

export interface YMapEventLike<T = unknown> {
  readonly target: YOctoMapHandle<T>;
  readonly transaction: YTransactionLike;
  readonly keysChanged: Set<string>;
  readonly keys: Map<
    string,
    { action: 'add' | 'update' | 'delete'; oldValue: unknown }
  >;
  readonly changes: {
    keys: Map<
      string,
      { action: 'add' | 'update' | 'delete'; oldValue: unknown }
    >;
  };
}

export interface YArrayEventLike<T = unknown> {
  readonly target: YOctoArrayHandle<T>;
  readonly transaction: YTransactionLike;
  readonly changes: {
    delta: Array<{
      retain?: number;
      delete?: number;
      insert?: unknown[];
    }>;
  };
}

export interface YTextEventLike {
  readonly target: YOctoTextHandle;
  readonly transaction: YTransactionLike;
}

export type YEventLike = YMapEventLike | YArrayEventLike | YTextEventLike;
export type YOctoHandle =
  | YOctoMapHandle<any>
  | YOctoArrayHandle<any>
  | YOctoTextHandle;

type MapObserver<T> = (
  event: YMapEventLike<T>,
  transaction: YTransactionLike
) => void;
type ArrayObserver<T> = (
  event: YArrayEventLike<T>,
  transaction: YTransactionLike
) => void;
type TextObserver = (
  event: YTextEventLike,
  transaction: YTransactionLike
) => void;
type DeepObserver = (
  events: YEventLike[],
  transaction: YTransactionLike
) => void;

function fireListenerSet<E>(
  set: Set<(event: E, tx: YTransactionLike) => void>,
  event: E,
  tx: YTransactionLike
): void {
  if (set.size === 0) return;
  for (const fn of Array.from(set)) {
    fn(event, tx);
  }
}

export class YOctoMapHandle<T = unknown> {
  readonly __yoctoHandle = 'map' as const;
  readonly target: TypeTarget;
  parent: YOctoHandle | null = null;

  private _cache: Map<string, unknown> | null = null;
  private readonly _observers = new Set<MapObserver<T>>();
  private readonly _deepObservers = new Set<DeepObserver>();

  constructor(
    readonly adapter: YOctoSpaceAdapter,
    readonly identity: TypeIdentity,
    parent: YOctoHandle | null = null
  ) {
    this.target = { Identity: identity };
    this.parent = parent;
  }

  get doc(): YOctoSpaceDoc {
    return this.adapter.spaceDoc;
  }

  private _ensureCache(): Map<string, unknown> {
    if (this._cache !== null) {
      return this._cache;
    }
    const entries = this.adapter.session.readMap(this.target);
    const cache = new Map<string, unknown>();
    for (const [k, rv] of entries) {
      cache.set(k, this.adapter.materializeReadValue(rv, this));
    }
    this._cache = cache;
    return cache;
  }

  private _resolveLazyKey(key: string): unknown {
    const rv = this.adapter.session.getMapValue(this.target, key);
    if (rv === null) {
      this._cache?.delete(key);
      return undefined;
    }
    const materialized = this.adapter.materializeReadValue(rv, this);
    this._cache?.set(key, materialized);
    return materialized;
  }

  get size(): number {
    return this._ensureCache().size;
  }

  has(key: string): boolean {
    return this._ensureCache().has(key);
  }

  get(key: string): T {
    const cache = this._ensureCache();
    const val = cache.get(key);
    if (val === LAZY_SENTINEL) {
      return this._resolveLazyKey(key) as T;
    }
    return val as T;
  }

  set(key: string, value: T): T {
    const sv = jsValueToSessionValue(value);
    this.setRawSessionValue(key, sv);
    return value;
  }

  /**
   * High-throughput atomic write using a pre-built binary-tape `SessionValue`.
   */
  setRawSessionValue(key: string, sv: SessionValue): void {
    this.adapter.session.mapSet(this.target, key, sv);
    if (this._cache !== null) {
      if ('Any' in sv) {
        this._cache.set(key, sv.Any);
      } else {
        this._cache.set(key, LAZY_SENTINEL);
      }
    }
  }

  delete(key: string): void {
    this.adapter.session.mapRemove(this.target, key);
    this._cache?.delete(key);
  }

  clear(): void {
    this.adapter.session.mapClear(this.target);
    if (this._cache !== null) {
      this._cache.clear();
    }
  }

  forEach(fn: (value: T, key: string, map: this) => void): void {
    const cache = this._ensureCache();
    for (const key of Array.from(cache.keys())) {
      const val = this.get(key);
      fn(val, key, this);
    }
  }

  keys(): IterableIterator<string> {
    return this._ensureCache().keys();
  }

  *values(): IterableIterator<T> {
    const cache = this._ensureCache();
    for (const key of Array.from(cache.keys())) {
      yield this.get(key);
    }
  }

  *entries(): IterableIterator<[string, T]> {
    const cache = this._ensureCache();
    for (const key of Array.from(cache.keys())) {
      yield [key, this.get(key)];
    }
  }

  [Symbol.iterator](): IterableIterator<[string, T]> {
    return this.entries();
  }

  toJSON(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    this.forEach((val, key) => {
      if (isYOctoHandle(val)) {
        out[key] = val.toJSON();
      } else {
        out[key] = val;
      }
    });
    return out;
  }

  observe(fn: MapObserver<T>): void {
    this._observers.add(fn);
  }

  unobserve(fn: MapObserver<T>): void {
    this._observers.delete(fn);
  }

  observeDeep(fn: DeepObserver): void {
    this._deepObservers.add(fn);
  }

  unobserveDeep(fn: DeepObserver): void {
    this._deepObservers.delete(fn);
  }

  /** @internal */
  _hasObservers(): boolean {
    return this._observers.size > 0 || this._deepObservers.size > 0;
  }

  /** @internal */
  _syncFromCommit(
    changedKeys: string[],
    tx: YTransactionLike
  ): YMapEventLike<T> | null {
    const changesMap = new Map<
      string,
      { action: 'add' | 'update' | 'delete'; oldValue: unknown }
    >();
    const keysChanged = new Set<string>();

    if (this._cache === null) {
      // Cache wasn't populated yet. Populate it and report changedKeys (or all keys) as added.
      const entries = this.adapter.session.readMap(this.target);
      const nextCache = new Map<string, unknown>();
      for (const [k, rv] of entries) {
        nextCache.set(k, this.adapter.materializeReadValue(rv, this));
      }
      this._cache = nextCache;

      const keysToReport =
        changedKeys.length > 0 ? changedKeys : Array.from(nextCache.keys());
      for (const k of keysToReport) {
        keysChanged.add(k);
        if (nextCache.has(k)) {
          changesMap.set(k, { action: 'add', oldValue: undefined });
        } else {
          changesMap.set(k, { action: 'delete', oldValue: undefined });
        }
      }
    } else if (changedKeys.length > 0) {
      for (const k of changedKeys) {
        const hadKey = this._cache.has(k);
        const oldVal = this._cache.get(k);
        const rv = this.adapter.session.getMapValue(this.target, k);
        if (rv === null) {
          if (hadKey || !tx.local) {
            this._cache.delete(k);
            keysChanged.add(k);
            changesMap.set(k, {
              action: 'delete',
              oldValue: oldVal === LAZY_SENTINEL ? undefined : oldVal,
            });
          } else {
            // Local delete already removed from _cache
            keysChanged.add(k);
            changesMap.set(k, { action: 'delete', oldValue: undefined });
          }
        } else {
          const nextVal = this.adapter.materializeReadValue(rv, this);
          const wasSentinel = oldVal === LAZY_SENTINEL;
          this._cache.set(k, nextVal);
          keysChanged.add(k);
          changesMap.set(k, {
            action: hadKey && !wasSentinel ? 'update' : 'add',
            oldValue: wasSentinel ? undefined : oldVal,
          });
        }
      }
    } else {
      // Full diff when granular keys aren't provided (e.g. mapClear / undo / remote batch)
      const oldCache = this._cache;
      const entries = this.adapter.session.readMap(this.target);
      const nextCache = new Map<string, unknown>();
      for (const [k, rv] of entries) {
        nextCache.set(k, this.adapter.materializeReadValue(rv, this));
      }
      this._cache = nextCache;

      for (const [k, oldVal] of oldCache) {
        if (!nextCache.has(k)) {
          keysChanged.add(k);
          changesMap.set(k, {
            action: 'delete',
            oldValue: oldVal === LAZY_SENTINEL ? undefined : oldVal,
          });
        }
      }
      for (const [k, nextVal] of nextCache) {
        if (!oldCache.has(k)) {
          keysChanged.add(k);
          changesMap.set(k, { action: 'add', oldValue: undefined });
        } else {
          const oldVal = oldCache.get(k);
          if (oldVal !== nextVal) {
            keysChanged.add(k);
            changesMap.set(k, {
              action: 'update',
              oldValue: oldVal === LAZY_SENTINEL ? undefined : oldVal,
            });
          }
        }
      }
    }

    if (keysChanged.size === 0) {
      return null;
    }

    return {
      target: this,
      transaction: tx,
      keysChanged,
      keys: changesMap,
      changes: { keys: changesMap },
    };
  }

  /** @internal */
  _fireObservers(event: YMapEventLike<T>, tx: YTransactionLike): void {
    fireListenerSet(this._observers, event, tx);
  }

  /** @internal */
  _fireDeepObservers(events: YEventLike[], tx: YTransactionLike): void {
    fireListenerSet(this._deepObservers, events, tx);
  }
}

export class YOctoArrayHandle<T = unknown> {
  readonly __yoctoHandle = 'array' as const;
  readonly target: TypeTarget;
  parent: YOctoHandle | null = null;

  private _cache: unknown[] | null = null;
  private readonly _observers = new Set<ArrayObserver<T>>();
  private readonly _deepObservers = new Set<DeepObserver>();

  constructor(
    readonly adapter: YOctoSpaceAdapter,
    readonly identity: TypeIdentity,
    parent: YOctoHandle | null = null
  ) {
    this.target = { Identity: identity };
    this.parent = parent;
  }

  get doc(): YOctoSpaceDoc {
    return this.adapter.spaceDoc;
  }

  private _ensureCache(): unknown[] {
    if (this._cache !== null) {
      return this._cache;
    }
    const items = this.adapter.session.readArray(this.target);
    this._cache = items.map(rv => this.adapter.materializeReadValue(rv, this));
    return this._cache;
  }

  private _resolveLazyAt(index: number): unknown {
    const rv = this.adapter.session.readArrayAt(this.target, index);
    if (rv === null) {
      return undefined;
    }
    const materialized = this.adapter.materializeReadValue(rv, this);
    if (this._cache && index < this._cache.length) {
      this._cache[index] = materialized;
    }
    return materialized;
  }

  get length(): number {
    return this._ensureCache().length;
  }

  get(index: number): T {
    const cache = this._ensureCache();
    const val = cache[index];
    if (val === LAZY_SENTINEL) {
      return this._resolveLazyAt(index) as T;
    }
    return val as T;
  }

  toArray(): T[] {
    const cache = this._ensureCache();
    const out: T[] = [];
    for (let i = 0; i < cache.length; i++) {
      const val = cache[i];
      out.push((val === LAZY_SENTINEL ? this._resolveLazyAt(i) : val) as T);
    }
    return out;
  }

  insert(index: number, content: T[]): void {
    if (content.length === 0) return;
    const svs = content.map(jsValueToSessionValue);
    const curLen = this._cache !== null ? this._cache.length : -1;
    if (curLen >= 0 && index === curLen) {
      this.adapter.session.arrayPush(this.target, svs);
    } else {
      this.adapter.session.arrayInsert(this.target, index, svs);
    }
    if (this._cache !== null) {
      const cachedItems = svs.map(sv => ('Any' in sv ? sv.Any : LAZY_SENTINEL));
      this._cache.splice(index, 0, ...cachedItems);
    }
  }

  push(content: T[]): void {
    if (content.length === 0) return;
    const svs = content.map(jsValueToSessionValue);
    this.adapter.session.arrayPush(this.target, svs);
    if (this._cache !== null) {
      for (const sv of svs) {
        this._cache.push('Any' in sv ? sv.Any : LAZY_SENTINEL);
      }
    }
  }

  unshift(content: T[]): void {
    this.insert(0, content);
  }

  delete(index: number, length = 1): void {
    if (length <= 0) return;
    this.adapter.session.arrayRemove(this.target, index, length);
    if (this._cache !== null) {
      this._cache.splice(index, length);
    }
  }

  forEach(fn: (value: T, index: number, array: this) => void): void {
    const arr = this.toArray();
    for (let i = 0; i < arr.length; i++) {
      fn(arr[i], i, this);
    }
  }

  map<U>(fn: (value: T, index: number, array: this) => U): U[] {
    const arr = this.toArray();
    return arr.map((v, i) => fn(v, i, this));
  }

  slice(start?: number, end?: number): T[] {
    return this.toArray().slice(start, end);
  }

  toJSON(): unknown[] {
    return this.toArray().map(v => (isYOctoHandle(v) ? v.toJSON() : v));
  }

  observe(fn: ArrayObserver<T>): void {
    this._observers.add(fn);
  }

  unobserve(fn: ArrayObserver<T>): void {
    this._observers.delete(fn);
  }

  observeDeep(fn: DeepObserver): void {
    this._deepObservers.add(fn);
  }

  unobserveDeep(fn: DeepObserver): void {
    this._deepObservers.delete(fn);
  }

  /** @internal */
  _syncFromCommit(tx: YTransactionLike): YArrayEventLike<T> | null {
    const oldLen = this._cache?.length ?? 0;
    const items = this.adapter.session.readArray(this.target);
    const nextCache = items.map(rv =>
      this.adapter.materializeReadValue(rv, this)
    );
    this._cache = nextCache;

    const delta: Array<{
      retain?: number;
      delete?: number;
      insert?: unknown[];
    }> = [];
    if (oldLen > 0) {
      delta.push({ delete: oldLen });
    }
    if (nextCache.length > 0) {
      delta.push({ insert: nextCache.slice() });
    }

    return {
      target: this,
      transaction: tx,
      changes: { delta },
    };
  }

  /** @internal */
  _fireObservers(event: YArrayEventLike<T>, tx: YTransactionLike): void {
    fireListenerSet(this._observers, event, tx);
  }

  /** @internal */
  _fireDeepObservers(events: YEventLike[], tx: YTransactionLike): void {
    fireListenerSet(this._deepObservers, events, tx);
  }
}

export class YOctoTextHandle {
  readonly __yoctoHandle = 'text' as const;
  readonly target: TypeTarget;
  parent: YOctoHandle | null = null;

  private _lenCache: number | null = null;
  private _strCache: string | null = null;
  private _deltaCache: DeltaOperation[] | null = null;
  private readonly _observers = new Set<TextObserver>();
  private readonly _deepObservers = new Set<DeepObserver>();

  constructor(
    readonly adapter: YOctoSpaceAdapter,
    readonly identity: TypeIdentity,
    parent: YOctoHandle | null = null
  ) {
    this.target = { Identity: identity };
    this.parent = parent;
  }

  get doc(): YOctoSpaceDoc {
    return this.adapter.spaceDoc;
  }

  private _invalidateContent(): void {
    this._strCache = null;
    this._deltaCache = null;
  }

  private _invalidateAll(): void {
    this._lenCache = null;
    this._strCache = null;
    this._deltaCache = null;
  }

  get length(): number {
    if (this._lenCache === null) {
      this._lenCache = this.adapter.session.readTextLen(this.target);
    }
    return this._lenCache;
  }

  toString(): string {
    if (this._strCache === null) {
      this._strCache = this.adapter.session.readTextString(this.target);
    }
    return this._strCache;
  }

  toJSON(): string {
    return this.toString();
  }

  toDelta(): DeltaOperation[] {
    if (this._deltaCache === null) {
      const ops = this.adapter.session.readTextDelta(this.target);
      this._deltaCache = deltaOpsToYjs(ops);
    }
    return this._deltaCache.map(op =>
      op.attributes ? { ...op, attributes: { ...op.attributes } } : { ...op }
    );
  }

  insert(
    index: number,
    content: string,
    attributes?: Record<string, unknown>
  ): void {
    if (!content.length) return;
    const hasAttrs = attributes && Object.keys(attributes).length > 0;
    if (!hasAttrs) {
      // Hot path: scalar direct Wasm export (session_text_insert_id)
      this.adapter.session.textInsert(this.target, index, content);
    } else {
      const ops: TextDeltaOp[] = [];
      if (index > 0) {
        ops.push({ retain: index });
      }
      ops.push({ insert: content, format: attributes });
      this.adapter.session.textApplyDelta(this.target, ops);
    }
    if (this._lenCache !== null) {
      this._lenCache += content.length;
    }
    this._invalidateContent();
  }

  delete(index: number, length: number): void {
    if (length <= 0) return;
    // Hot path: scalar direct Wasm export (session_text_remove_id)
    this.adapter.session.textRemove(this.target, index, length);
    if (this._lenCache !== null) {
      this._lenCache = Math.max(0, this._lenCache - length);
    }
    this._invalidateContent();
  }

  format(
    index: number,
    length: number,
    attributes: Record<string, unknown>
  ): void {
    if (length <= 0) return;
    this.adapter.session.textFormat(this.target, index, length, attributes);
    this._deltaCache = null;
  }

  insertEmbed(
    index: number,
    embed: unknown,
    attributes?: Record<string, unknown>
  ): void {
    this.adapter.session.textInsertEmbed(this.target, index, embed);
    if (attributes && Object.keys(attributes).length > 0) {
      this.adapter.session.textFormat(this.target, index, 1, attributes);
    }
    if (this._lenCache !== null) {
      this._lenCache += 1;
    }
    this._invalidateContent();
  }

  applyDelta(delta: DeltaOperation[]): void {
    if (delta.length === 0) return;
    this.adapter.session.textApplyDelta(this.target, yjsDeltaToOps(delta));
    this._invalidateAll();
  }

  clone(): Y.Text {
    const cloned = new Y.Text();
    const delta = this.toDelta();
    if (delta.length > 0) {
      cloned.applyDelta(delta);
    }
    return cloned;
  }

  createRelativePosition(index: number, assoc = 0): YOctoRelativePosition {
    const { bytes } = this.adapter.session.createRelativePosition(
      this.target,
      index,
      assoc
    );
    return { bytes, __yoctoRelPos: true };
  }

  resolveRelativePosition(
    pos: YOctoRelativePosition,
    followUndoneDeletions = false
  ): number | null {
    const abs = this.adapter.session.resolveRelativePosition(
      pos.bytes,
      followUndoneDeletions
    );
    return abs ? abs.index : null;
  }

  observe(fn: TextObserver): void {
    this._observers.add(fn);
  }

  unobserve(fn: TextObserver): void {
    this._observers.delete(fn);
  }

  observeDeep(fn: DeepObserver): void {
    this._deepObservers.add(fn);
  }

  unobserveDeep(fn: DeepObserver): void {
    this._deepObservers.delete(fn);
  }

  /** @internal */
  _syncFromCommit(tx: YTransactionLike): YTextEventLike {
    this._invalidateAll();
    return {
      target: this,
      transaction: tx,
    };
  }

  /** @internal */
  _fireObservers(event: YTextEventLike, tx: YTransactionLike): void {
    fireListenerSet(this._observers, event, tx);
  }

  /** @internal */
  _fireDeepObservers(events: YEventLike[], tx: YTransactionLike): void {
    fireListenerSet(this._deepObservers, events, tx);
  }
}

export function isYOctoMapHandle(value: unknown): value is YOctoMapHandle<any> {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as YOctoMapHandle).__yoctoHandle === 'map'
  );
}

export function isYOctoArrayHandle(
  value: unknown
): value is YOctoArrayHandle<any> {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as YOctoArrayHandle).__yoctoHandle === 'array'
  );
}

export function isYOctoTextHandle(value: unknown): value is YOctoTextHandle {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as YOctoTextHandle).__yoctoHandle === 'text'
  );
}

export function isYOctoHandle(value: unknown): value is YOctoHandle {
  return (
    isYOctoMapHandle(value) ||
    isYOctoArrayHandle(value) ||
    isYOctoTextHandle(value)
  );
}

export class YOctoSpaceDoc {
  readonly __yoctoSpaceDoc = true as const;
  readonly guid: string;
  readonly session: YOctoDocSession;
  readonly adapter: YOctoSpaceAdapter;

  constructor(adapter: YOctoSpaceAdapter) {
    this.adapter = adapter;
    this.session = adapter.session;
    this.guid = adapter.session.guid;
  }

  get clientID(): number {
    return this.session.clientID;
  }

  set clientID(id: number) {
    this.session.setClient(id);
  }

  get isDestroyed(): boolean {
    return this.session.isDestroyed;
  }

  transact<T>(fn: () => T, origin?: unknown): T {
    if (this.session.txDepth() === 0) {
      this.session.advanceTime(Date.now());
    }
    let txOrigin: SessionTxOrigin;
    if (origin === null) {
      txOrigin = 'Untracked';
    } else if (
      origin === undefined ||
      origin === this.session.clientID ||
      (typeof origin === 'object' &&
        origin !== null &&
        (origin as { proxy?: boolean }).proxy === true)
    ) {
      txOrigin = 'Tracked';
    } else if (typeof origin === 'string') {
      txOrigin = { Named: origin };
    } else {
      txOrigin = 'Tracked';
    }

    const { result } = this.session.transact(fn, origin, txOrigin);
    return result;
  }

  getMap<T = unknown>(name: string): YOctoMapHandle<T> {
    return this.adapter.getRootMap<T>(name);
  }

  applyUpdate(update: Uint8Array, origin?: unknown): SessionCommit | null {
    return this.session.applyUpdate(update, origin);
  }

  encodeStateAsUpdate(targetStateVector?: Uint8Array): Uint8Array {
    return this.session.encodeStateAsUpdate(targetStateVector);
  }

  encodeStateVector(): Uint8Array {
    return this.session.encodeStateVector();
  }

  load(): void {
    // No-op: YOctoDocSession is immediately ready in memory.
  }

  on(event: string, listener: (...args: any[]) => void): void {
    this.session.on(event as any, listener);
  }

  off(event: string, listener: (...args: any[]) => void): void {
    this.session.off(event as any, listener);
  }

  once(event: string, listener: (...args: any[]) => void): void {
    this.session.once(event as any, listener);
  }

  emit(event: string, args: any[]): void {
    this.session.emit(event as any, args as any);
  }

  destroy(): void {
    this.adapter.destroy();
  }
}

export function isYOctoSpaceDoc(value: unknown): value is YOctoSpaceDoc {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as YOctoSpaceDoc).__yoctoSpaceDoc === true
  );
}

export class YOctoSpaceAdapter {
  readonly session: YOctoDocSession;
  readonly spaceDoc: YOctoSpaceDoc;
  private readonly handles = new Map<string, YOctoHandle>();
  private readonly afterCommitHooks = new Set<
    (commit: SessionCommit, origin: unknown) => void
  >();

  constructor(options?: {
    guid?: string;
    clientId?: number;
    gc?: boolean;
    session?: YOctoDocSession;
  }) {
    this.session =
      options?.session ??
      new YOctoDocSession({
        guid: options?.guid,
        clientId: options?.clientId,
        gc: options?.gc ?? true,
        undo: 'custom',
      });
    this.spaceDoc = new YOctoSpaceDoc(this);
    this.session.on('afterTransaction', this._handleAfterTransaction);
  }

  onAfterCommit(
    fn: (commit: SessionCommit, origin: unknown) => void
  ): () => void {
    this.afterCommitHooks.add(fn);
    return () => {
      this.afterCommitHooks.delete(fn);
    };
  }

  getRootMap<T = unknown>(name: string): YOctoMapHandle<T> {
    const id: TypeIdentity = { Root: name };
    const key = identityKey(id);
    const existing = this.handles.get(key);
    if (existing && isYOctoMapHandle(existing)) {
      return existing as YOctoMapHandle<T>;
    }
    this.session.ensureRoot(name, 'Map');
    const handle = new YOctoMapHandle<T>(this, id, null);
    this.handles.set(key, handle);
    return handle;
  }

  getOrCreateMap<T = unknown>(
    identity: TypeIdentity,
    parent: YOctoHandle | null
  ): YOctoMapHandle<T> {
    const key = identityKey(identity);
    const existing = this.handles.get(key);
    if (existing && isYOctoMapHandle(existing)) {
      if (parent && !existing.parent) {
        existing.parent = parent;
      }
      return existing as YOctoMapHandle<T>;
    }
    const handle = new YOctoMapHandle<T>(this, identity, parent);
    this.handles.set(key, handle);
    return handle;
  }

  getOrCreateArray<T = unknown>(
    identity: TypeIdentity,
    parent: YOctoHandle | null
  ): YOctoArrayHandle<T> {
    const key = identityKey(identity);
    const existing = this.handles.get(key);
    if (existing && isYOctoArrayHandle(existing)) {
      if (parent && !existing.parent) {
        existing.parent = parent;
      }
      return existing as YOctoArrayHandle<T>;
    }
    const handle = new YOctoArrayHandle<T>(this, identity, parent);
    this.handles.set(key, handle);
    return handle;
  }

  getOrCreateText(
    identity: TypeIdentity,
    parent: YOctoHandle | null
  ): YOctoTextHandle {
    const key = identityKey(identity);
    const existing = this.handles.get(key);
    if (existing && isYOctoTextHandle(existing)) {
      if (parent && !existing.parent) {
        existing.parent = parent;
      }
      return existing;
    }
    const handle = new YOctoTextHandle(this, identity, parent);
    this.handles.set(key, handle);
    return handle;
  }

  materializeReadValue(
    rv: SessionReadValue,
    parent: YOctoHandle | null
  ): unknown {
    if ('Any' in rv) {
      return rv.Any;
    }
    if ('Map' in rv) {
      return this.getOrCreateMap(rv.Map, parent);
    }
    if ('Array' in rv) {
      return this.getOrCreateArray(rv.Array, parent);
    }
    if ('Text' in rv) {
      return this.getOrCreateText(rv.Text, parent);
    }
    if ('Doc' in rv) {
      return rv.Doc;
    }
    return rv;
  }

  private readonly _handleAfterTransaction = (
    commit: SessionCommit,
    origin: unknown
  ) => {
    const isUndoRedo =
      typeof commit.origin_kind === 'object' &&
      ('Undo' in commit.origin_kind || 'Redo' in commit.origin_kind);

    const tx: YTransactionLike = {
      local: commit.is_local,
      origin: isUndoRedo
        ? Y_OCTO_UNDO_ORIGIN
        : commit.is_local
          ? (origin ?? this.session.clientID)
          : (origin ?? 'remote'),
      doc: this.spaceDoc,
      commit,
    };

    const deepBuckets = new Map<YOctoHandle, YEventLike[]>();

    for (const changed of commit.changed) {
      const handle = this.handles.get(identityKey(changed.identity));
      if (!handle) {
        continue;
      }

      let event: YEventLike | null = null;
      if (isYOctoMapHandle(handle)) {
        event = handle._syncFromCommit(changed.keys, tx);
        if (event) {
          handle._fireObservers(event, tx);
        }
      } else if (isYOctoArrayHandle(handle)) {
        event = handle._syncFromCommit(tx);
        if (event) {
          handle._fireObservers(event, tx);
        }
      } else if (isYOctoTextHandle(handle)) {
        event = handle._syncFromCommit(tx);
        handle._fireObservers(event, tx);
      }

      if (event) {
        let cur: YOctoHandle | null = handle;
        while (cur) {
          let list = deepBuckets.get(cur);
          if (!list) {
            list = [];
            deepBuckets.set(cur, list);
          }
          list.push(event);
          cur = cur.parent;
        }
      }
    }

    for (const [handle, events] of deepBuckets) {
      handle._fireDeepObservers(events, tx);
    }

    for (const hook of Array.from(this.afterCommitHooks)) {
      hook(commit, origin);
    }
  };

  destroy(): void {
    this.session.off('afterTransaction', this._handleAfterTransaction);
    this.afterCommitHooks.clear();
    this.handles.clear();
    this.session.destroy();
  }
}

export function createYOctoSpaceDoc(options?: {
  guid?: string;
  clientId?: number;
  gc?: boolean;
  session?: YOctoDocSession;
}): YOctoSpaceDoc {
  const adapter = new YOctoSpaceAdapter(options);
  return adapter.spaceDoc;
}
