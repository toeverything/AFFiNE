import { nanoid } from 'nanoid';

import {
  generateSafeClientId,
  getYOctoTapeSync,
  UNDO_MODE_MAP,
  type YOctoBinaryTape,
  YTYPE_KIND_MAP,
} from './runtime.js';
import type {
  AbsolutePositionResult,
  AwarenessChangeEvent,
  RelativePositionResult,
  SessionCommit,
  SessionReadValue,
  SessionTxOrigin,
  SessionUndoMode,
  SessionValue,
  TextDeltaOp,
  TypeIdentity,
  TypePath,
  TypeStatus,
  TypeTarget,
  YTypeKind,
} from './types.js';

export const FORMATTING_CLEANUP_ORIGIN = 'y-octo:formatting-cleanup';

export interface DocSessionOptions {
  clientId?: number;
  guid?: string;
  gc?: boolean;
  undo?: SessionUndoMode;
  captureTimeoutMs?: number;
}

export interface AwarenessClientRotator {
  setLocalId(newClientId: number): AwarenessChangeEvent;
}

type DocSessionEventMap = {
  update: [
    update: Uint8Array,
    origin: unknown,
    doc: YOctoDocSession,
    commit: SessionCommit,
  ];
  afterTransaction: [
    commit: SessionCommit,
    origin: unknown,
    doc: YOctoDocSession,
  ];
  sync: [isSynced: boolean, doc: YOctoDocSession];
  destroy: [doc: YOctoDocSession];
};

type DocSessionEventName = keyof DocSessionEventMap;
type AnyListener = (...args: any[]) => void;

export class YOctoDocSession {
  readonly guid: string;
  private readonly tape: YOctoBinaryTape;
  private handle: number;
  private _clientID: number;
  private readonly knownRoots = new Set<string>();
  private readonly listeners = new Map<DocSessionEventName, Set<AnyListener>>();
  private readonly linkedAwarenesses = new Set<AwarenessClientRotator>();
  private outerCustomOrigin: unknown = undefined;
  private destroyed = false;

  constructor(options: DocSessionOptions = {}) {
    this.tape = getYOctoTapeSync();
    this.guid = options.guid ?? nanoid();
    this._clientID = options.clientId ?? generateSafeClientId();
    const gc = options.gc ?? true;
    const undo = options.undo ?? 'global';
    const captureTimeoutMs = options.captureTimeoutMs ?? 500;
    const undoMode = UNDO_MODE_MAP[undo];
    if (undoMode === undefined) {
      throw new Error(`Invalid undo mode: ${String(undo)}`);
    }

    const cid = BigInt(this._clientID);
    const gcFlag = gc ? 1 : 0;
    const timeout = BigInt(captureTimeoutMs);
    this.handle = this.tape.withInputFrame(this.guid.length * 3 + 16, () => {
      const guidLen = this.tape.writeUtf8Raw(this.guid, this.tape.inPtr);
      this.tape.wPos = this.tape.inPtr + guidLen;
      const handle = this.tape.exp.session_create(
        cid,
        guidLen,
        gcFlag,
        undoMode,
        timeout
      );
      if (!handle) {
        throw new Error(this.tape.readError() || 'session_create failed');
      }
      return handle;
    });
  }

  get clientID(): number {
    return this._clientID;
  }

  get isDestroyed(): boolean {
    return this.destroyed;
  }

  attachAwareness(awareness: AwarenessClientRotator): () => void {
    this.linkedAwarenesses.add(awareness);
    return () => {
      this.linkedAwarenesses.delete(awareness);
    };
  }

  on<K extends DocSessionEventName>(
    event: K,
    listener: (...args: DocSessionEventMap[K]) => void
  ): void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as AnyListener);
  }

  off<K extends DocSessionEventName>(
    event: K,
    listener: (...args: DocSessionEventMap[K]) => void
  ): void {
    this.listeners.get(event)?.delete(listener as AnyListener);
  }

  once<K extends DocSessionEventName>(
    event: K,
    listener: (...args: DocSessionEventMap[K]) => void
  ): void {
    const wrapper = (...args: DocSessionEventMap[K]) => {
      this.off(event, wrapper);
      listener(...args);
    };
    this.on(event, wrapper);
  }

  emit<K extends DocSessionEventName>(
    event: K,
    args: DocSessionEventMap[K]
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
    this.emit('destroy', [this]);
    this.listeners.clear();
    this.linkedAwarenesses.clear();
    this.free();
  }

  free(): void {
    if (this.handle) {
      this.tape.exp.session_free(this.handle);
      this.handle = 0;
    }
  }

  getRootNames(): string[] {
    return Array.from(this.knownRoots);
  }

  hasRoot(name: string): boolean {
    return this.knownRoots.has(name);
  }

  private assertAlive(): void {
    if (!this.handle) {
      throw new Error('DocSession has been destroyed');
    }
  }

  private execTape(): void {
    this.assertAlive();
    const len = this.tape.wPos - this.tape.inPtr;
    this.tape.checkOk(this.tape.exp.session_exec(this.handle, len));
    this.tape.rStart();
  }

  private trackRootsFromCommit(
    commit: SessionCommit | null
  ): SessionCommit | null {
    if (!commit) {
      return null;
    }
    for (const changed of commit.changed) {
      if (Object.hasOwn(changed.identity, 'Root')) {
        this.knownRoots.add((changed.identity as { Root: string }).Root);
      } else if (changed.path?.root) {
        this.knownRoots.add(changed.path.root);
      }
    }
    return commit;
  }

  private emitCommit(commit: SessionCommit | null, origin: unknown): void {
    if (!commit) {
      return;
    }
    if (commit.update.length > 0) {
      this.emit('update', [commit.update, origin, this, commit]);
    }
    this.emit('afterTransaction', [commit, origin, this]);
  }

  private finalizeCommit(
    commit: SessionCommit | null,
    origin: unknown
  ): SessionCommit | null {
    const tracked = this.trackRootsFromCommit(commit);
    this.emitCommit(tracked, origin);
    return tracked;
  }

  private rotateClientIfRequired(): boolean {
    if (!this.clientRequired()) {
      return false;
    }
    const nextClientId = generateSafeClientId(this._clientID);
    this.setClient(nextClientId);
    for (const awareness of this.linkedAwarenesses) {
      awareness.setLocalId(nextClientId);
    }
    return true;
  }

  client(): number {
    this.assertAlive();
    return this.tape.withInputFrame(64, () => {
      this.tape.wU32(21);
      this.execTape();
      return this.tape.rU64();
    });
  }

  clientRequired(): boolean {
    this.assertAlive();
    return this.tape.withInputFrame(64, () => {
      this.tape.wU32(22);
      this.execTape();
      return this.tape.rU32() !== 0;
    });
  }

  setClient(clientId: number): void {
    this.assertAlive();
    const nextId = Number(clientId);
    this.tape.withInputFrame(64, () => {
      this.tape.wU32(23);
      this.tape.wU64(nextId);
      this.execTape();
      this.tape.rU32();
    });
    this._clientID = nextId;
  }

  txDepth(): number {
    if (!this.handle) return 0;
    return this.tape.exp.session_tx_depth(this.handle);
  }

  beginTx(origin: SessionTxOrigin = 'Tracked'): number {
    this.assertAlive();
    if (origin === 'Tracked' || origin === 'Untracked') {
      return this.tape.checkOk(
        this.tape.exp.session_begin_tx(
          this.handle,
          origin === 'Tracked' ? 0 : 1
        )
      );
    }
    return this.tape.withInputFrame(1024, () => {
      this.tape.wU32(1);
      this.tape.wTxOrigin(origin);
      this.execTape();
      return this.tape.rU32();
    });
  }

  commitTx(): SessionCommit | null {
    this.assertAlive();
    const code = this.tape.checkOk(
      this.tape.exp.session_commit_tx(this.handle)
    );
    if (code === 1) return null;
    this.tape.rStart();
    return this.trackRootsFromCommit(this.tape.rCommitBody());
  }

  /**
   * Executes `fn` inside a deferred transaction frame. Even if `fn` throws,
   * `commitTx()` runs in `finally` to match Yjs `doc.transact` semantics.
   */
  transact<T>(
    fn: () => T,
    origin?: unknown,
    txOrigin: SessionTxOrigin = 'Tracked'
  ): { result: T; commit: SessionCommit | null } {
    const isOutermost = this.txDepth() === 0;
    if (isOutermost) {
      this.outerCustomOrigin = origin;
    }
    this.beginTx(txOrigin);
    let commit: SessionCommit | null = null;
    let result!: T;
    let threw = false;
    let caught: unknown;
    try {
      result = fn();
    } catch (err) {
      threw = true;
      caught = err;
    } finally {
      commit = this.commitTx();
      if (isOutermost) {
        const emitOrigin = this.outerCustomOrigin;
        this.outerCustomOrigin = undefined;
        this.emitCommit(commit, emitOrigin);
      }
    }
    if (threw) {
      if (caught && typeof caught === 'object') {
        (caught as { commit?: SessionCommit | null }).commit = commit;
      }
      throw caught;
    }
    return { result, commit };
  }

  ensureRoot(name: string, kind: YTypeKind): TypeIdentity {
    this.assertAlive();
    const kindCode = YTYPE_KIND_MAP[kind];
    if (kindCode === undefined) {
      throw new Error(`Invalid YTypeKind: ${String(kind)}`);
    }
    const identity = this.tape.withInputFrame(1024, () => {
      this.tape.wU32(5);
      this.tape.wStr(name);
      this.tape.wU32(kindCode);
      this.execTape();
      return this.tape.rIdentity();
    });
    this.knownRoots.add(name);
    return identity;
  }

  resolvePath(path: TypePath): TypeIdentity | null {
    this.assertAlive();
    return this.tape.withInputFrame(1024, () => {
      this.tape.wU32(6);
      this.tape.wPath(path);
      this.execTape();
      return this.tape.rU32() === 0 ? null : this.tape.rIdentity();
    });
  }

  typeStatus(identity: TypeIdentity): TypeStatus {
    this.assertAlive();
    return this.tape.withInputFrame(1024, () => {
      this.tape.wU32(25);
      this.tape.wIdentity(identity);
      this.execTape();
      return this.tape.rTypeStatus();
    });
  }

  getMapValue(target: TypeTarget, key: string): SessionReadValue | null {
    this.assertAlive();
    return this.tape.withInputFrame(1024, () => {
      this.tape.wU32(7);
      this.tape.wTarget(target);
      this.tape.wStr(key);
      this.execTape();
      return this.tape.rU32() === 0 ? null : this.tape.rReadValue();
    });
  }

  readMap(target: TypeTarget): [string, SessionReadValue][] {
    this.assertAlive();
    return this.tape.withInputFrame(1024, () => {
      this.tape.wU32(8);
      this.tape.wTarget(target);
      this.execTape();
      const len = this.tape.rU32();
      const out: [string, SessionReadValue][] = [];
      for (let i = 0; i < len; i++) {
        out.push([this.tape.rStr(), this.tape.rReadValue()]);
      }
      return out;
    });
  }

  readArray(target: TypeTarget): SessionReadValue[] {
    this.assertAlive();
    return this.tape.withInputFrame(1024, () => {
      this.tape.wU32(9);
      this.tape.wTarget(target);
      this.execTape();
      const len = this.tape.rU32();
      const out: SessionReadValue[] = [];
      for (let i = 0; i < len; i++) {
        out.push(this.tape.rReadValue());
      }
      return out;
    });
  }

  readArrayAt(target: TypeTarget, index: number): SessionReadValue | null {
    this.assertAlive();
    return this.tape.withInputFrame(1024, () => {
      this.tape.wU32(26);
      this.tape.wTarget(target);
      this.tape.wU64(index);
      this.execTape();
      return this.tape.rU32() === 0 ? null : this.tape.rReadValue();
    });
  }

  readTextLen(target: TypeTarget): number {
    this.assertAlive();
    return this.tape.withInputFrame(1024, () => {
      this.tape.wU32(27);
      this.tape.wTarget(target);
      this.execTape();
      return this.tape.rU64();
    });
  }

  readTextString(target: TypeTarget): string {
    this.assertAlive();
    return this.tape.withInputFrame(1024, () => {
      this.tape.wU32(10);
      this.tape.wTarget(target);
      this.execTape();
      return this.tape.rStr();
    });
  }

  readTextDelta(target: TypeTarget): TextDeltaOp[] {
    this.assertAlive();
    return this.tape.withInputFrame(1024, () => {
      this.tape.wU32(11);
      this.tape.wTarget(target);
      this.execTape();
      return this.tape.rDelta();
    });
  }

  mapSet(
    target: TypeTarget,
    key: string,
    value: SessionValue,
    origin?: unknown
  ): SessionCommit | null {
    this.assertAlive();
    const hasAny = Object.hasOwn(value, 'Any');
    const anyVal = hasAny ? (value as { Any: unknown }).Any : undefined;
    if (
      Object.hasOwn(target, 'Identity') &&
      Object.hasOwn((target as { Identity: TypeIdentity }).Identity, 'Item') &&
      hasAny &&
      typeof anyVal === 'number' &&
      (!Number.isInteger(anyVal) || anyVal < -2147483648 || anyVal > 2147483647)
    ) {
      const id = (
        (target as { Identity: TypeIdentity }).Identity as {
          Item: { client: number; clock: number };
        }
      ).Item;
      const cLo = id.client >>> 0;
      const cHi = Math.floor(id.client / 4294967296) >>> 0;
      const clk = id.clock >>> 0;
      const commit = this.tape.withInputFrame(key.length * 3 + 8, () => {
        const klen = this.tape.writeUtf8Raw(key, this.tape.inPtr);
        this.tape.wPos = this.tape.inPtr + klen;
        const code = this.tape.checkOk(
          this.tape.exp.session_map_set_f64_id(
            this.handle,
            cLo,
            cHi,
            clk,
            klen,
            anyVal
          )
        );
        if (code === 1) return null;
        this.tape.rStart();
        return this.tape.rCommitBody();
      });
      return this.finalizeCommit(commit, origin);
    }

    const commit = this.tape.withInputFrame(1024, () => {
      this.tape.wU32(12);
      this.tape.wTarget(target);
      this.tape.wStr(key);
      if (hasAny) {
        this.tape.wU32(0);
        this.tape.wAny(anyVal);
      } else {
        this.tape.wSessionValue(value);
      }
      this.execTape();
      return this.tape.rOptCommit();
    });
    return this.finalizeCommit(commit, origin);
  }

  mapRemove(
    target: TypeTarget,
    key: string,
    origin?: unknown
  ): SessionCommit | null {
    this.assertAlive();
    const commit = this.tape.withInputFrame(1024, () => {
      this.tape.wU32(13);
      this.tape.wTarget(target);
      this.tape.wStr(key);
      this.execTape();
      return this.tape.rOptCommit();
    });
    return this.finalizeCommit(commit, origin);
  }

  mapClear(target: TypeTarget, origin?: unknown): SessionCommit | null {
    this.assertAlive();
    const commit = this.tape.withInputFrame(1024, () => {
      this.tape.wU32(28);
      this.tape.wTarget(target);
      this.execTape();
      return this.tape.rOptCommit();
    });
    return this.finalizeCommit(commit, origin);
  }

  arrayInsert(
    target: TypeTarget,
    index: number,
    values: SessionValue[],
    origin?: unknown
  ): SessionCommit | null {
    this.assertAlive();
    const commit = this.tape.withInputFrame(1024, () => {
      this.tape.wU32(14);
      this.tape.wTarget(target);
      this.tape.wU64(index);
      this.tape.wU32(values.length);
      for (const v of values) {
        this.tape.wSessionValue(v);
      }
      this.execTape();
      return this.tape.rOptCommit();
    });
    return this.finalizeCommit(commit, origin);
  }

  arrayPush(
    target: TypeTarget,
    values: SessionValue[],
    origin?: unknown
  ): SessionCommit | null {
    this.assertAlive();
    const commit = this.tape.withInputFrame(1024, () => {
      this.tape.wU32(15);
      this.tape.wTarget(target);
      this.tape.wU32(values.length);
      for (const v of values) {
        this.tape.wSessionValue(v);
      }
      this.execTape();
      return this.tape.rOptCommit();
    });
    return this.finalizeCommit(commit, origin);
  }

  arrayRemove(
    target: TypeTarget,
    index: number,
    len: number,
    origin?: unknown
  ): SessionCommit | null {
    this.assertAlive();
    const commit = this.tape.withInputFrame(1024, () => {
      this.tape.wU32(29);
      this.tape.wTarget(target);
      this.tape.wU64(index);
      this.tape.wU64(len);
      this.execTape();
      return this.tape.rOptCommit();
    });
    return this.finalizeCommit(commit, origin);
  }

  textInsert(
    target: TypeTarget,
    index: number,
    text: string,
    origin?: unknown
  ): SessionCommit | null {
    this.assertAlive();
    if (Object.hasOwn(target, 'Identity') && index <= 0xffffffff) {
      const identity = (target as { Identity: TypeIdentity }).Identity;
      const idxU32 = index >>> 0;
      if (Object.hasOwn(identity, 'Root')) {
        const root = (identity as { Root: string }).Root;
        const commit = this.tape.withInputFrame(
          (root.length + text.length) * 3 + 16,
          () => {
            const rlen = this.tape.writeUtf8Raw(root, this.tape.inPtr);
            const tlen = this.tape.writeUtf8Raw(text, this.tape.inPtr + rlen);
            this.tape.wPos = this.tape.inPtr + rlen + tlen;
            const code = this.tape.checkOk(
              this.tape.exp.session_text_insert_root(
                this.handle,
                rlen,
                idxU32,
                tlen
              )
            );
            if (code === 1) return null;
            this.tape.rStart();
            return this.tape.rCommitBody();
          }
        );
        return this.finalizeCommit(commit, origin);
      }
      const id = (identity as { Item: { client: number; clock: number } }).Item;
      if (id.clock <= 0xffffffff) {
        const cLo = id.client >>> 0;
        const cHi = Math.floor(id.client / 4294967296) >>> 0;
        const clk = id.clock >>> 0;
        const commit = this.tape.withInputFrame(text.length * 3 + 8, () => {
          const tlen = this.tape.writeUtf8Raw(text, this.tape.inPtr);
          this.tape.wPos = this.tape.inPtr + tlen;
          const code = this.tape.checkOk(
            this.tape.exp.session_text_insert_id(
              this.handle,
              cLo,
              cHi,
              clk,
              idxU32,
              tlen
            )
          );
          if (code === 1) return null;
          this.tape.rStart();
          return this.tape.rCommitBody();
        });
        return this.finalizeCommit(commit, origin);
      }
    }

    const commit = this.tape.withInputFrame(1024, () => {
      this.tape.wU32(16);
      this.tape.wTarget(target);
      this.tape.wU64(index);
      this.tape.wStr(text);
      this.execTape();
      return this.tape.rOptCommit();
    });
    return this.finalizeCommit(commit, origin);
  }

  textRemove(
    target: TypeTarget,
    index: number,
    len: number,
    origin?: unknown
  ): SessionCommit | null {
    this.assertAlive();
    if (
      Object.hasOwn(target, 'Identity') &&
      Object.hasOwn((target as { Identity: TypeIdentity }).Identity, 'Item') &&
      (
        (target as { Identity: TypeIdentity }).Identity as {
          Item: { client: number; clock: number };
        }
      ).Item.clock <= 0xffffffff &&
      index <= 0xffffffff &&
      len <= 0xffffffff
    ) {
      const id = (
        (target as { Identity: TypeIdentity }).Identity as {
          Item: { client: number; clock: number };
        }
      ).Item;
      const code = this.tape.checkOk(
        this.tape.exp.session_text_remove_id(
          this.handle,
          id.client >>> 0,
          Math.floor(id.client / 4294967296) >>> 0,
          id.clock >>> 0,
          index >>> 0,
          len >>> 0
        )
      );
      if (code === 1) return null;
      this.tape.rStart();
      return this.finalizeCommit(this.tape.rCommitBody(), origin);
    }

    const commit = this.tape.withInputFrame(1024, () => {
      this.tape.wU32(17);
      this.tape.wTarget(target);
      this.tape.wU64(index);
      this.tape.wU64(len);
      this.execTape();
      return this.tape.rOptCommit();
    });
    return this.finalizeCommit(commit, origin);
  }

  textFormat(
    target: TypeTarget,
    index: number,
    len: number,
    attrs: Record<string, unknown>,
    origin?: unknown
  ): SessionCommit | null {
    this.assertAlive();
    const commit = this.tape.withInputFrame(1024, () => {
      this.tape.wU32(30);
      this.tape.wTarget(target);
      this.tape.wU64(index);
      this.tape.wU64(len);
      this.tape.wFormat(attrs);
      this.execTape();
      return this.tape.rOptCommit();
    });
    return this.finalizeCommit(commit, origin);
  }

  textInsertEmbed(
    target: TypeTarget,
    index: number,
    embed: unknown,
    origin?: unknown
  ): SessionCommit | null {
    this.assertAlive();
    const commit = this.tape.withInputFrame(1024, () => {
      this.tape.wU32(31);
      this.tape.wTarget(target);
      this.tape.wU64(index);
      this.tape.wAny(embed);
      this.execTape();
      return this.tape.rOptCommit();
    });
    return this.finalizeCommit(commit, origin);
  }

  textApplyDelta(
    target: TypeTarget,
    delta: TextDeltaOp[],
    origin?: unknown
  ): SessionCommit | null {
    this.assertAlive();
    const commit = this.tape.withInputFrame(1024, () => {
      this.tape.wU32(18);
      this.tape.wTarget(target);
      this.tape.wDelta(delta);
      this.execTape();
      return this.tape.rOptCommit();
    });
    return this.finalizeCommit(commit, origin);
  }

  xmlName(target: TypeTarget): string {
    this.assertAlive();
    return this.tape.withInputFrame(1024, () => {
      this.tape.wU32(34);
      this.tape.wTarget(target);
      this.execTape();
      return this.tape.rStr();
    });
  }

  xmlSetAttr(
    target: TypeTarget,
    key: string,
    value: unknown,
    origin?: unknown
  ): SessionCommit | null {
    this.assertAlive();
    const commit = this.tape.withInputFrame(1024, () => {
      this.tape.wU32(35);
      this.tape.wTarget(target);
      this.tape.wStr(key);
      this.tape.wAny(value);
      this.execTape();
      return this.tape.rOptCommit();
    });
    return this.finalizeCommit(commit, origin);
  }

  xmlGetAttr(target: TypeTarget, key: string): unknown {
    this.assertAlive();
    return this.tape.withInputFrame(1024, () => {
      this.tape.wU32(36);
      this.tape.wTarget(target);
      this.tape.wStr(key);
      this.execTape();
      return this.tape.rU32() === 0 ? null : this.tape.rAny();
    });
  }

  xmlRemoveAttr(
    target: TypeTarget,
    key: string,
    origin?: unknown
  ): SessionCommit | null {
    this.assertAlive();
    const commit = this.tape.withInputFrame(1024, () => {
      this.tape.wU32(37);
      this.tape.wTarget(target);
      this.tape.wStr(key);
      this.execTape();
      return this.tape.rOptCommit();
    });
    return this.finalizeCommit(commit, origin);
  }

  xmlAttrs(target: TypeTarget): [string, unknown][] {
    this.assertAlive();
    return this.tape.withInputFrame(1024, () => {
      this.tape.wU32(38);
      this.tape.wTarget(target);
      this.execTape();
      const len = this.tape.rU32();
      const out: [string, unknown][] = [];
      for (let i = 0; i < len; i++) {
        out.push([this.tape.rStr(), this.tape.rAny()]);
      }
      return out;
    });
  }

  xmlToString(target: TypeTarget): string {
    this.assertAlive();
    return this.tape.withInputFrame(1024, () => {
      this.tape.wU32(39);
      this.tape.wTarget(target);
      this.execTape();
      return this.tape.rStr();
    });
  }

  createRelativePosition(
    target: TypeTarget,
    index: number,
    assoc = 0
  ): RelativePositionResult {
    this.assertAlive();
    return this.tape.withInputFrame(1024, () => {
      this.tape.wU32(40);
      this.tape.wTarget(target);
      this.tape.wU64(index);
      this.tape.wI64(assoc);
      this.execTape();
      return { bytes: this.tape.rBytes() };
    });
  }

  resolveRelativePosition(
    bytes: Uint8Array,
    followUndoneDeletions = false
  ): AbsolutePositionResult | null {
    this.assertAlive();
    return this.tape.withInputFrame(1024, () => {
      this.tape.wU32(41);
      this.tape.wBytes(bytes);
      this.tape.wU32(followUndoneDeletions ? 1 : 0);
      this.execTape();
      if (this.tape.rU32() === 0) return null;
      return {
        type: this.tape.rIdentity(),
        index: this.tape.rU64(),
        assoc: this.tape.rI64(),
      };
    });
  }

  advanceTime(nowMs: number): void {
    this.assertAlive();
    const ts = Number(nowMs);
    this.tape.withInputFrame(64, () => {
      this.tape.wU32(42);
      this.tape.wU64(ts);
      this.execTape();
      this.tape.rU32();
    });
  }

  setUndoSelectionMeta(metaBytes: Uint8Array): boolean {
    this.assertAlive();
    return this.tape.withInputFrame(1024, () => {
      this.tape.wU32(43);
      this.tape.wBytes(metaBytes);
      this.execTape();
      return this.tape.rU32() !== 0;
    });
  }

  undo(origin?: unknown): SessionCommit | null {
    this.assertAlive();
    const commit = this.tape.withInputFrame(64, () => {
      this.tape.wU32(19);
      this.execTape();
      return this.tape.rOptCommit();
    });
    return this.finalizeCommit(commit, origin);
  }

  redo(origin?: unknown): SessionCommit | null {
    this.assertAlive();
    const commit = this.tape.withInputFrame(64, () => {
      this.tape.wU32(20);
      this.execTape();
      return this.tape.rOptCommit();
    });
    return this.finalizeCommit(commit, origin);
  }

  stopCapturing(): void {
    this.assertAlive();
    this.tape.withInputFrame(64, () => {
      this.tape.wU32(44);
      this.execTape();
      this.tape.rU32();
    });
  }

  clearHistory(undo = true, redo = true): void {
    this.assertAlive();
    this.tape.withInputFrame(64, () => {
      this.tape.wU32(45);
      this.tape.wU32(undo ? 1 : 0);
      this.tape.wU32(redo ? 1 : 0);
      this.execTape();
      this.tape.rU32();
    });
  }

  canUndo(): boolean {
    if (!this.handle) return false;
    return this.tape.exp.session_can_undo(this.handle) !== 0;
  }

  canRedo(): boolean {
    if (!this.handle) return false;
    return this.tape.exp.session_can_redo(this.handle) !== 0;
  }

  createUndoStack(
    scopes: TypeTarget[] = [],
    captureTimeoutMs = 500,
    trackedOrigins: SessionTxOrigin[] = ['Tracked']
  ): number {
    this.assertAlive();
    return this.tape.withInputFrame(1024, () => {
      this.tape.wU32(47);
      this.tape.wU32(scopes.length);
      for (const scope of scopes) {
        this.tape.wTarget(scope);
      }
      this.tape.wU64(captureTimeoutMs);
      this.tape.wU32(trackedOrigins.length);
      for (const origin of trackedOrigins) {
        this.tape.wTxOrigin(origin);
      }
      this.execTape();
      return this.tape.rU32();
    });
  }

  undoStack(stackId: number, origin?: unknown): SessionCommit | null {
    this.assertAlive();
    const commit = this.tape.withInputFrame(64, () => {
      this.tape.wU32(48);
      this.tape.wU32(stackId);
      this.execTape();
      return this.tape.rOptCommit();
    });
    return this.finalizeCommit(commit, origin);
  }

  redoStack(stackId: number, origin?: unknown): SessionCommit | null {
    this.assertAlive();
    const commit = this.tape.withInputFrame(64, () => {
      this.tape.wU32(49);
      this.tape.wU32(stackId);
      this.execTape();
      return this.tape.rOptCommit();
    });
    return this.finalizeCommit(commit, origin);
  }

  canUndoStack(stackId: number): boolean {
    this.assertAlive();
    return this.tape.withInputFrame(64, () => {
      this.tape.wU32(50);
      this.tape.wU32(stackId);
      this.execTape();
      return this.tape.rU32() !== 0;
    });
  }

  canRedoStack(stackId: number): boolean {
    this.assertAlive();
    return this.tape.withInputFrame(64, () => {
      this.tape.wU32(51);
      this.tape.wU32(stackId);
      this.execTape();
      return this.tape.rU32() !== 0;
    });
  }

  setStackSelectionMeta(
    stackId: number,
    stack: 'Undo' | 'Redo',
    metaBytes: Uint8Array
  ): boolean {
    this.assertAlive();
    return this.tape.withInputFrame(1024, () => {
      this.tape.wU32(52);
      this.tape.wU32(stackId);
      this.tape.wU32(stack === 'Redo' ? 1 : 0);
      this.tape.wBytes(metaBytes);
      this.execTape();
      return this.tape.rU32() !== 0;
    });
  }

  stopCapturingStack(stackId: number): void {
    this.assertAlive();
    this.tape.withInputFrame(64, () => {
      this.tape.wU32(53);
      this.tape.wU32(stackId);
      this.execTape();
      this.tape.rU32();
    });
  }

  clearStackHistory(stackId: number, undo = true, redo = true): void {
    this.assertAlive();
    this.tape.withInputFrame(64, () => {
      this.tape.wU32(54);
      this.tape.wU32(stackId);
      this.tape.wU32(undo ? 1 : 0);
      this.tape.wU32(redo ? 1 : 0);
      this.execTape();
      this.tape.rU32();
    });
  }

  destroyUndoStack(stackId: number): boolean {
    if (!this.handle) return false;
    return this.tape.withInputFrame(64, () => {
      this.tape.wU32(55);
      this.tape.wU32(stackId);
      this.execTape();
      return this.tape.rU32() !== 0;
    });
  }

  applyUpdateAll(update: Uint8Array, origin?: unknown): SessionCommit[] {
    this.assertAlive();
    const src = update instanceof Uint8Array ? update : new Uint8Array(update);
    const commits = this.tape.withInputFrame(src.length, () => {
      this.tape.u8.set(src, this.tape.inPtr);
      this.tape.wPos = this.tape.inPtr + src.length;
      const code = this.tape.checkOk(
        this.tape.exp.session_apply_update_v1(this.handle, src.length)
      );
      const count = code - 1;
      if (count <= 0) {
        return [];
      }
      this.tape.rStart();
      const out: SessionCommit[] = [];
      for (let i = 0; i < count; i++) {
        const body = this.trackRootsFromCommit(this.tape.rCommitBody());
        if (body) {
          out.push(body);
        }
      }
      return out;
    });
    this.rotateClientIfRequired();
    for (const commit of commits) {
      const emitOrigin =
        commit.origin_kind === 'FormattingCleanup'
          ? FORMATTING_CLEANUP_ORIGIN
          : origin;
      this.emitCommit(commit, emitOrigin);
    }
    return commits;
  }

  applyUpdate(update: Uint8Array, origin?: unknown): SessionCommit | null {
    const commits = this.applyUpdateAll(update, origin);
    if (commits.length === 0) {
      return null;
    }
    return commits.find(c => c.update.length > 0) ?? commits[0];
  }

  applyUpdateV1(update: Uint8Array, origin?: unknown): SessionCommit | null {
    return this.applyUpdate(update, origin);
  }

  encodeStateAsUpdate(remoteStateVector?: Uint8Array): Uint8Array {
    if (remoteStateVector) {
      return this.encodeDiffV1(remoteStateVector);
    }
    return this.encodeUpdateV1();
  }

  encodeUpdateV1(): Uint8Array {
    this.assertAlive();
    this.tape.checkOk(this.tape.exp.session_encode_update_v1(this.handle));
    return this.tape.readRawOutBytes();
  }

  encodeStateVector(): Uint8Array {
    return this.encodeStateVectorV1();
  }

  encodeStateVectorV1(): Uint8Array {
    this.assertAlive();
    this.tape.checkOk(this.tape.exp.session_encode_sv_v1(this.handle));
    return this.tape.readRawOutBytes();
  }

  encodeDiffV1(remoteSv: Uint8Array): Uint8Array {
    this.assertAlive();
    const src =
      remoteSv instanceof Uint8Array ? remoteSv : new Uint8Array(remoteSv);
    return this.tape.withInputFrame(src.length, () => {
      this.tape.u8.set(src, this.tape.inPtr);
      this.tape.wPos = this.tape.inPtr + src.length;
      this.tape.checkOk(
        this.tape.exp.session_encode_diff_v1(this.handle, src.length)
      );
      return this.tape.readRawOutBytes();
    });
  }
}

export { YOctoDocSession as DocSession };
