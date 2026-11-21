import type {
  AwarenessChangeEvent,
  PathSegment,
  SessionChangedType,
  SessionCommit,
  SessionOriginKind,
  SessionReadValue,
  SessionTxOrigin,
  SessionUndoMode,
  SessionValue,
  TextDeltaOp,
  TypeIdentity,
  TypePath,
  TypeStatus,
  TypeTarget,
  YOctoWasmExports,
  YTypeKind,
} from './types.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { ignoreBOM: true });

export const YTYPE_KIND_MAP: Record<YTypeKind, number> = {
  Array: 0,
  Map: 1,
  Text: 2,
  XMLElement: 3,
  XmlElement: 3,
  XMLFragment: 4,
  XmlFragment: 4,
  XMLHook: 5,
  XmlHook: 5,
  XMLText: 6,
  XmlText: 6,
  Unknown: 7,
};

const YTYPE_KIND_REV: readonly YTypeKind[] = [
  'Array',
  'Map',
  'Text',
  'XMLElement',
  'XMLFragment',
  'XMLHook',
  'XMLText',
  'Unknown',
];

export const UNDO_MODE_MAP: Record<SessionUndoMode, number> = {
  global: 0,
  disabled: 1,
  custom: 2,
};

const ASCII_WRITE_FAST_MAX = 16;
const ASCII_READ_FAST_MAX = 12;

type NodeFsLike = {
  readFileSync: (path: URL | string) => Uint8Array<ArrayBuffer>;
  existsSync: (path: string) => boolean;
};

type NodePathLike = {
  resolve: (...segments: string[]) => string;
};

type NodeProcessLike = {
  versions?: { node?: string };
  cwd?: () => string;
  getBuiltinModule?: (id: string) => unknown;
};

/**
 * 4-byte aligned little-endian binary tape + reusable scratch buffer
 * bound to a single `y-octo-wasm` WebAssembly instance.
 */
export class YOctoBinaryTape {
  readonly exp: YOctoWasmExports;
  private memBuf: ArrayBuffer;
  u8: Uint8Array;
  dv: DataView;
  inPtr = 0;
  private inCap = 0;
  wPos = 0;
  rPos = 0;
  private encodeDepth = 0;
  private pendingTrim = false;

  constructor(exp: YOctoWasmExports) {
    this.exp = exp;
    this.memBuf = exp.memory.buffer;
    this.u8 = new Uint8Array(this.memBuf);
    this.dv = new DataView(this.memBuf);
  }

  refreshMem(): void {
    if (this.memBuf !== this.exp.memory.buffer) {
      this.memBuf = this.exp.memory.buffer;
      this.u8 = new Uint8Array(this.memBuf);
      this.dv = new DataView(this.memBuf);
    }
  }

  private runTrimScratch(): void {
    this.pendingTrim = false;
    this.exp.runtime_trim_scratch();
    this.inPtr = 0;
    this.inCap = 0;
    this.wPos = 0;
    this.rPos = 0;
    this.refreshMem();
  }

  wReset(minCap = 1024): void {
    const req = Math.max(minCap, 64);
    this.inPtr = this.exp.in_buf_ensure(req);
    this.inCap = req;
    this.refreshMem();
    this.wPos = this.inPtr;
  }

  withInputFrame<T>(minCap: number, fn: () => T): T {
    let savedBytes: Uint8Array | null = null;
    let savedCap = 0;
    if (this.encodeDepth > 0) {
      this.refreshMem();
      savedBytes = this.u8.slice(this.inPtr, this.wPos);
      savedCap = this.inCap;
    }
    this.encodeDepth++;
    try {
      this.wReset(minCap);
      return fn();
    } finally {
      this.encodeDepth--;
      if (this.encodeDepth > 0 && savedBytes !== null) {
        const need = Math.max(savedCap, savedBytes.length, 64);
        this.inPtr = this.exp.in_buf_ensure(need);
        this.inCap = need;
        this.refreshMem();
        this.u8.set(savedBytes, this.inPtr);
        this.wPos = this.inPtr + savedBytes.length;
      } else if (this.encodeDepth === 0 && this.pendingTrim) {
        this.runTrimScratch();
      }
    }
  }

  wEnsure(extra: number): void {
    const used = this.wPos - this.inPtr;
    if (used + extra > this.inCap) {
      const nextCap = Math.max((used + extra) * 2, this.inCap * 2, 1024);
      this.inPtr = this.exp.in_buf_ensure(nextCap);
      this.inCap = nextCap;
      this.refreshMem();
      this.wPos = this.inPtr + used;
    } else {
      this.refreshMem();
    }
  }

  wU32(v: number): void {
    this.wEnsure(4);
    this.dv.setUint32(this.wPos, v, true);
    this.wPos += 4;
  }

  wI32(v: number): void {
    this.wEnsure(4);
    this.dv.setInt32(this.wPos, v, true);
    this.wPos += 4;
  }

  wU64(v: number): void {
    this.wEnsure(8);
    const lo = v >>> 0;
    const hi = Math.floor(v / 4294967296) >>> 0;
    this.dv.setUint32(this.wPos, lo, true);
    this.dv.setUint32(this.wPos + 4, hi, true);
    this.wPos += 8;
  }

  wI64(v: number | bigint): void {
    this.wEnsure(8);
    this.dv.setBigInt64(this.wPos, BigInt(v), true);
    this.wPos += 8;
  }

  wF64(v: number): void {
    this.wEnsure(8);
    this.dv.setFloat64(this.wPos, v, true);
    this.wPos += 8;
  }

  writeUtf8Raw(str: string, off: number): number {
    const slen = str.length;
    if (slen <= ASCII_WRITE_FAST_MAX) {
      for (let i = 0; i < slen; i++) {
        const c = str.charCodeAt(i);
        if (c >= 0x80) {
          return encoder.encodeInto(str, this.u8.subarray(off)).written;
        }
        this.u8[off + i] = c;
      }
      return slen;
    }
    return encoder.encodeInto(str, this.u8.subarray(off)).written;
  }

  wStr(str: string): void {
    const maxBytes = str.length * 3 + 8;
    this.wEnsure(maxBytes);
    const lenOff = this.wPos;
    this.wPos += 4;
    const written = this.writeUtf8Raw(str, this.wPos);
    this.dv.setUint32(lenOff, written, true);
    this.wPos += (written + 3) & ~3;
  }

  wBytes(bytes: Uint8Array | ArrayLike<number>): void {
    const src = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const len = src.length;
    const padded = (len + 3) & ~3;
    this.wEnsure(4 + padded);
    this.dv.setUint32(this.wPos, len, true);
    this.wPos += 4;
    this.u8.set(src, this.wPos);
    this.wPos += padded;
  }

  wAny(val: unknown): void {
    if (val === undefined) {
      this.wU32(0);
    } else if (val === null) {
      this.wU32(1);
    } else if (val === false) {
      this.wU32(2);
    } else if (val === true) {
      this.wU32(3);
    } else if (typeof val === 'number') {
      if (
        Number.isInteger(val) &&
        !Object.is(val, -0) &&
        val >= -2147483648 &&
        val <= 2147483647
      ) {
        this.wU32(4);
        this.wI32(val);
      } else {
        this.wU32(6);
        this.wF64(val);
      }
    } else if (typeof val === 'bigint') {
      this.wU32(7);
      this.wI64(val);
    } else if (typeof val === 'string') {
      this.wU32(8);
      this.wStr(val);
    } else if (val instanceof Uint8Array) {
      this.wU32(9);
      this.wBytes(val);
    } else if (Array.isArray(val)) {
      this.wU32(10);
      this.wU32(val.length);
      for (const item of val) {
        this.wAny(item);
      }
    } else if (typeof val === 'object') {
      this.wU32(11);
      const record = val as Record<string, unknown>;
      const keys = Object.keys(record);
      this.wU32(keys.length);
      for (const key of keys) {
        this.wStr(key);
        this.wAny(record[key]);
      }
    } else {
      this.wU32(0);
    }
  }

  wTxOrigin(origin: SessionTxOrigin | undefined): void {
    if (origin === 'Tracked' || origin === undefined) {
      this.wU32(0);
    } else if (origin === 'Untracked') {
      this.wU32(1);
    } else if (typeof origin === 'object' && typeof origin.Named === 'string') {
      this.wU32(2);
      this.wStr(origin.Named);
    } else {
      throw new Error(`Invalid SessionTxOrigin: ${String(origin)}`);
    }
  }

  wIdentity(id: TypeIdentity): void {
    if (Object.hasOwn(id, 'Root')) {
      this.wU32(0);
      this.wStr((id as { Root: string }).Root);
    } else {
      const item = (id as { Item: { client: number; clock: number } }).Item;
      this.wU32(1);
      this.wU64(item.client);
      this.wU64(item.clock);
    }
  }

  wPath(path: TypePath): void {
    this.wStr(path.root);
    this.wU32(path.segments.length);
    for (const seg of path.segments) {
      if (Object.hasOwn(seg, 'Key')) {
        this.wU32(0);
        this.wStr((seg as { Key: string }).Key);
      } else {
        this.wU32(1);
        this.wU64((seg as { Index: number }).Index);
      }
    }
  }

  wTarget(target: TypeTarget): void {
    if (Object.hasOwn(target, 'Identity')) {
      this.wU32(0);
      this.wIdentity((target as { Identity: TypeIdentity }).Identity);
    } else {
      this.wU32(1);
      this.wPath((target as { Path: TypePath }).Path);
    }
  }

  wFormat(fmt: Record<string, unknown> | undefined): void {
    if (!fmt) {
      this.wU32(0);
      return;
    }
    const keys = Object.keys(fmt);
    this.wU32(keys.length);
    for (const key of keys) {
      this.wStr(key);
      this.wAny(fmt[key]);
    }
  }

  wDelta(delta: TextDeltaOp[]): void {
    this.wU32(delta.length);
    for (const op of delta) {
      if (Object.hasOwn(op, 'insert')) {
        const insOp = op as {
          insert: string | unknown[] | Record<string, unknown>;
          format?: Record<string, unknown>;
        };
        const ins = insOp.insert;
        const fmt = insOp.format;
        if (typeof ins === 'string') {
          this.wU32(0);
          this.wStr(ins);
          this.wFormat(fmt);
        } else if (Array.isArray(ins)) {
          this.wU32(1);
          this.wU32(ins.length);
          for (const item of ins) {
            this.wAny(item);
          }
          this.wFormat(fmt);
        } else {
          this.wU32(1);
          this.wU32(1);
          this.wAny(ins);
          this.wFormat(fmt);
        }
      } else if (Object.hasOwn(op, 'retain')) {
        const retOp = op as {
          retain: number;
          format?: Record<string, unknown>;
        };
        this.wU32(2);
        this.wU64(retOp.retain);
        this.wFormat(retOp.format);
      } else {
        this.wU32(3);
        this.wU64((op as { delete: number }).delete);
      }
    }
  }

  wSessionValue(v: SessionValue): void {
    if (Object.hasOwn(v, 'Any')) {
      this.wU32(0);
      this.wAny((v as { Any: unknown }).Any);
    } else if (Object.hasOwn(v, 'Map')) {
      this.wU32(1);
      const entries = (v as { Map: [string, SessionValue][] }).Map;
      this.wU32(entries.length);
      for (const [k, val] of entries) {
        this.wStr(k);
        this.wSessionValue(val);
      }
    } else if (Object.hasOwn(v, 'Array')) {
      this.wU32(2);
      const arr = (v as { Array: SessionValue[] }).Array;
      this.wU32(arr.length);
      for (const item of arr) {
        this.wSessionValue(item);
      }
    } else if (Object.hasOwn(v, 'Text')) {
      this.wU32(3);
      this.wDelta((v as { Text: TextDeltaOp[] }).Text);
    } else if (Object.hasOwn(v, 'Doc')) {
      const doc = (v as { Doc: { guid: string; gc: boolean } }).Doc;
      this.wU32(4);
      this.wStr(doc.guid);
      this.wU32(doc.gc ? 1 : 0);
    } else if (Object.hasOwn(v, 'XmlElement')) {
      const el = (
        v as {
          XmlElement: {
            tag: string;
            attrs?: [string, unknown][];
            children?: SessionValue[];
          };
        }
      ).XmlElement;
      this.wU32(5);
      this.wStr(el.tag);
      const attrs = el.attrs ?? [];
      this.wU32(attrs.length);
      for (const [k, val] of attrs) {
        this.wStr(k);
        this.wAny(val);
      }
      const children = el.children ?? [];
      this.wU32(children.length);
      for (const child of children) {
        this.wSessionValue(child);
      }
    } else if (Object.hasOwn(v, 'XmlFragment')) {
      this.wU32(6);
      const children = (v as { XmlFragment: SessionValue[] }).XmlFragment;
      this.wU32(children.length);
      for (const child of children) {
        this.wSessionValue(child);
      }
    } else if (Object.hasOwn(v, 'XmlText')) {
      this.wU32(7);
      this.wDelta((v as { XmlText: TextDeltaOp[] }).XmlText);
    } else if (Object.hasOwn(v, 'XmlHook')) {
      const hook = (
        v as {
          XmlHook: {
            name: string;
            entries?: [string, SessionValue][];
          };
        }
      ).XmlHook;
      this.wU32(8);
      this.wStr(hook.name);
      const entries = hook.entries ?? [];
      this.wU32(entries.length);
      for (const [k, val] of entries) {
        this.wStr(k);
        this.wSessionValue(val);
      }
    } else {
      throw new Error('Invalid SessionValue');
    }
  }

  rStart(): number {
    this.refreshMem();
    this.rPos = this.exp.out_buf_ptr();
    return this.exp.out_buf_len();
  }

  readRawOutBytes(): Uint8Array {
    const len = this.rStart();
    return this.u8.slice(this.rPos, this.rPos + len);
  }

  rU32(): number {
    const v = this.dv.getUint32(this.rPos, true);
    this.rPos += 4;
    return v;
  }

  rI32(): number {
    const v = this.dv.getInt32(this.rPos, true);
    this.rPos += 4;
    return v;
  }

  rU64(): number {
    const lo = this.dv.getUint32(this.rPos, true);
    const hi = this.dv.getUint32(this.rPos + 4, true);
    this.rPos += 8;
    return hi * 4294967296 + lo;
  }

  rI64(): number {
    const v = Number(this.dv.getBigInt64(this.rPos, true));
    this.rPos += 8;
    return v;
  }

  rF64(): number {
    const v = this.dv.getFloat64(this.rPos, true);
    this.rPos += 8;
    return v;
  }

  rStr(): string {
    const len = this.dv.getUint32(this.rPos, true);
    this.rPos += 4;
    const start = this.rPos;
    this.rPos += (len + 3) & ~3;
    if (len === 0) return '';
    if (len <= ASCII_READ_FAST_MAX) {
      let allAscii = true;
      let s = '';
      for (let i = 0; i < len; i++) {
        const b = this.u8[start + i];
        if (b >= 0x80) {
          allAscii = false;
          break;
        }
        s += String.fromCharCode(b);
      }
      if (allAscii) return s;
    }
    return decoder.decode(this.u8.subarray(start, start + len));
  }

  rBytes(): Uint8Array {
    const len = this.dv.getUint32(this.rPos, true);
    this.rPos += 4;
    const out = this.u8.slice(this.rPos, this.rPos + len);
    this.rPos += (len + 3) & ~3;
    return out;
  }

  rAny(): unknown {
    switch (this.rU32()) {
      case 0:
        return undefined;
      case 1:
        return null;
      case 2:
        return false;
      case 3:
        return true;
      case 4:
        return this.rI32();
      case 5: {
        const v = this.dv.getFloat32(this.rPos, true);
        this.rPos += 4;
        return v;
      }
      case 6:
        return this.rF64();
      case 7: {
        const v = this.dv.getBigInt64(this.rPos, true);
        this.rPos += 8;
        return v;
      }
      case 8:
        return this.rStr();
      case 9:
        return this.rBytes();
      case 10: {
        const len = this.rU32();
        const arr: unknown[] = [];
        for (let i = 0; i < len; i++) {
          arr.push(this.rAny());
        }
        return arr;
      }
      case 11: {
        const len = this.rU32();
        const obj: Record<string, unknown> = {};
        for (let i = 0; i < len; i++) {
          const key = this.rStr();
          const val = this.rAny();
          Object.defineProperty(obj, key, {
            value: val,
            enumerable: true,
            writable: true,
            configurable: true,
          });
        }
        return obj;
      }
      default:
        throw new Error('bad aligned Any tag');
    }
  }

  rIdentity(): TypeIdentity {
    if (this.rU32() === 0) {
      return { Root: this.rStr() };
    }
    return { Item: { client: this.rU64(), clock: this.rU64() } };
  }

  rPath(): TypePath {
    const root = this.rStr();
    const len = this.rU32();
    const segments: PathSegment[] = [];
    for (let i = 0; i < len; i++) {
      segments.push(
        this.rU32() === 0 ? { Key: this.rStr() } : { Index: this.rU64() }
      );
    }
    return { root, segments };
  }

  rTypeStatus(): TypeStatus {
    const alive = this.rU32() !== 0;
    const kind =
      this.rU32() === 0 ? null : (YTYPE_KIND_REV[this.rU32()] ?? null);
    const path = this.rU32() === 0 ? null : this.rPath();
    return { alive, kind, path };
  }

  rReadValue(): SessionReadValue {
    switch (this.rU32()) {
      case 0:
        return { Any: this.rAny() };
      case 1:
        return { Map: this.rIdentity() };
      case 2:
        return { Array: this.rIdentity() };
      case 3:
        return { Text: this.rIdentity() };
      case 4:
        return { Doc: { guid: this.rStr(), gc: this.rU32() !== 0 } };
      case 5:
        return {
          XmlElement: { tag: this.rStr(), identity: this.rIdentity() },
        };
      case 6:
        return { XmlFragment: this.rIdentity() };
      case 7:
        return { XmlText: this.rIdentity() };
      case 8:
        return { XmlHook: { name: this.rStr(), identity: this.rIdentity() } };
      default:
        throw new Error('bad aligned ReadValue tag');
    }
  }

  rFormat(): Record<string, unknown> | undefined {
    const len = this.rU32();
    if (len === 0) return undefined;
    const obj: Record<string, unknown> = {};
    for (let i = 0; i < len; i++) {
      const key = this.rStr();
      const val = this.rAny();
      Object.defineProperty(obj, key, {
        value: val,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    return obj;
  }

  rDelta(): TextDeltaOp[] {
    const len = this.rU32();
    const ops: TextDeltaOp[] = [];
    for (let i = 0; i < len; i++) {
      const tag = this.rU32();
      if (tag === 0) {
        const insert = this.rStr();
        const format = this.rFormat();
        ops.push(format ? { insert, format } : { insert });
      } else if (tag === 1) {
        const elen = this.rU32();
        const insert: unknown[] = [];
        for (let j = 0; j < elen; j++) {
          insert.push(this.rAny());
        }
        const format = this.rFormat();
        ops.push(format ? { insert, format } : { insert });
      } else if (tag === 2) {
        const retain = this.rU64();
        const format = this.rFormat();
        ops.push(format ? { retain, format } : { retain });
      } else {
        ops.push({ delete: this.rU64() });
      }
    }
    return ops;
  }

  rCommitBody(): SessionCommit {
    const revision = this.rU64();
    const flags = this.rU32();
    const originTag = (flags >>> 4) & 0xf;
    let origin_kind: SessionOriginKind;
    if (originTag === 0) origin_kind = 'LocalTransact';
    else if (originTag === 1) origin_kind = 'LocalUntracked';
    else if (originTag === 2) origin_kind = 'RemoteSync';
    else if (originTag === 3) origin_kind = { Undo: { stack_id: this.rU32() } };
    else if (originTag === 4) origin_kind = { Redo: { stack_id: this.rU32() } };
    else if (originTag === 5) origin_kind = { LocalNamed: this.rStr() };
    else if (originTag === 6) origin_kind = 'FormattingCleanup';
    else throw new Error(`bad originTag ${originTag}`);

    const update = this.rBytes();
    const chLen = this.rU32();
    const changed: SessionChangedType[] = [];
    for (let i = 0; i < chLen; i++) {
      const identity = this.rIdentity();
      const path = this.rU32() === 0 ? null : this.rPath();
      const kLen = this.rU32();
      const keys: string[] = [];
      for (let j = 0; j < kLen; j++) {
        keys.push(this.rStr());
      }
      changed.push({ identity, path, keys });
    }
    const saLen = this.rU32();
    const subdocs_added: string[] = [];
    for (let i = 0; i < saLen; i++) {
      subdocs_added.push(this.rStr());
    }
    const srLen = this.rU32();
    const subdocs_removed: string[] = [];
    for (let i = 0; i < srLen; i++) {
      subdocs_removed.push(this.rStr());
    }
    const selection_meta = (flags & 0x100) !== 0 ? this.rBytes() : null;
    return {
      revision,
      update,
      is_local: (flags & 1) !== 0,
      origin_kind,
      changed,
      subdocs_added,
      subdocs_removed,
      can_undo: (flags & 2) !== 0,
      can_redo: (flags & 4) !== 0,
      selection_meta,
    };
  }

  rOptCommit(): SessionCommit | null {
    if (this.rU32() === 0) return null;
    return this.rCommitBody();
  }

  rAwarenessEvent(): AwarenessChangeEvent {
    const aLen = this.rU32();
    const added: number[] = [];
    for (let i = 0; i < aLen; i++) {
      added.push(this.rU64());
    }
    const uLen = this.rU32();
    const updated: number[] = [];
    for (let i = 0; i < uLen; i++) {
      updated.push(this.rU64());
    }
    const rLen = this.rU32();
    const removed: number[] = [];
    for (let i = 0; i < rLen; i++) {
      removed.push(this.rU64());
    }
    return { added, updated, removed };
  }

  readError(): string {
    this.refreshMem();
    const ptr = this.exp.error_ptr();
    const len = this.exp.error_len();
    return decoder.decode(this.u8.subarray(ptr, ptr + len));
  }

  checkOk(code: number): number {
    if (code === 0) {
      throw new Error(this.readError() || 'y-octo-wasm call failed');
    }
    return code;
  }

  trimScratch(): void {
    if (this.encodeDepth > 0) {
      this.pendingTrim = true;
      return;
    }
    this.runTrimScratch();
  }
}

function assertAbiVersion(exp: YOctoWasmExports): void {
  const version = exp.wasm_abi_version?.();
  if (version !== 1) {
    throw new Error(
      `y-octo-wasm ABI version mismatch: expected 1, got ${String(version)}`
    );
  }
}

let cachedTape: YOctoBinaryTape | null = null;
let pendingInit: Promise<YOctoWasmExports> | null = null;

function getNodeProcess(): NodeProcessLike | undefined {
  const proc = (globalThis as { process?: NodeProcessLike }).process;
  return proc?.versions?.node ? proc : undefined;
}

function getWasmUrl(): URL {
  return new URL('./y-octo-wasm.wasm', import.meta.url);
}

function resolveNodeWasmPath(
  url: URL,
  nodeProcess: NodeProcessLike,
  fsBuiltin: NodeFsLike
): URL | string {
  if (url.protocol === 'file:') {
    return url;
  }
  const decodedPath = decodeURIComponent(url.pathname);
  if (fsBuiltin.existsSync(decodedPath)) {
    return decodedPath;
  }
  const pathBuiltin = nodeProcess.getBuiltinModule?.('node:path') as
    | NodePathLike
    | undefined;
  const cwd = nodeProcess.cwd?.();
  if (pathBuiltin && cwd) {
    const candidate = pathBuiltin.resolve(cwd, decodedPath.replace(/^\/+/, ''));
    if (fsBuiltin.existsSync(candidate)) {
      return candidate;
    }
  }
  return url;
}

function assertZeroImports(mod: WebAssembly.Module): void {
  const imports = WebAssembly.Module.imports(mod);
  if (imports.length !== 0) {
    throw new Error(
      `y-octo-wasm expected zero host imports, got: ${JSON.stringify(imports)}`
    );
  }
}

async function loadWasmBytesAsync(): Promise<BufferSource> {
  const url = getWasmUrl();
  const nodeProcess = getNodeProcess();
  if (nodeProcess) {
    const fsBuiltin = nodeProcess.getBuiltinModule?.('node:fs') as
      | NodeFsLike
      | undefined;
    if (fsBuiltin) {
      return fsBuiltin.readFileSync(
        resolveNodeWasmPath(url, nodeProcess, fsBuiltin)
      );
    }
    const fsPromisesSpecifier = 'node:fs/promises';
    const fsPromises = (await import(
      /* webpackIgnore: true */ fsPromisesSpecifier
    )) as {
      readFile: (path: URL | string) => Promise<Uint8Array<ArrayBuffer>>;
    };
    return fsPromises.readFile(url);
  }

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch y-octo-wasm binary (${response.status} ${response.statusText})`
    );
  }
  return response.arrayBuffer();
}

function loadWasmBytesSync(): Uint8Array<ArrayBuffer> | null {
  const nodeProcess = getNodeProcess();
  if (!nodeProcess) {
    return null;
  }
  const fsBuiltin = nodeProcess.getBuiltinModule?.('node:fs') as
    | NodeFsLike
    | undefined;
  if (!fsBuiltin) {
    return null;
  }
  return fsBuiltin.readFileSync(
    resolveNodeWasmPath(getWasmUrl(), nodeProcess, fsBuiltin)
  );
}

/**
 * Generates a 53-bit positive safe integer client ID using `crypto.getRandomValues`.
 * Guarantees `1 <= id <= Number.MAX_SAFE_INTEGER`.
 */
export function generateSafeClientId(exclude?: number): number {
  const cryptoObj = globalThis.crypto;
  for (let attempt = 0; attempt < 8; attempt++) {
    let candidate: number;
    if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
      const buf = new Uint32Array(2);
      cryptoObj.getRandomValues(buf);
      const hi = buf[0] & 0x1f_ff_ff; // 21 bits
      const lo = buf[1] >>> 0; // 32 bits
      candidate = hi * 0x1_00_00_00_00 + lo;
    } else {
      candidate = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
    }
    if (candidate <= 0) {
      candidate = 1;
    }
    if (exclude === undefined || candidate !== exclude) {
      return candidate;
    }
  }
  return exclude === Number.MAX_SAFE_INTEGER ? 1 : (exclude ?? 0) + 1;
}

/**
 * Asynchronously pre-compiles and instantiates the `y-octo-wasm` module.
 * Call once during application bootstrap so synchronous `DocSession` / ORM
 * creation never hits browser main-thread sync-compile size limits.
 */
export async function ensureYOctoWasmReady(
  wasmBytes?: BufferSource
): Promise<YOctoWasmExports> {
  if (cachedTape) {
    return cachedTape.exp;
  }
  if (!wasmBytes && pendingInit) {
    return pendingInit;
  }

  const initPromise = (async () => {
    const bytes = wasmBytes ?? (await loadWasmBytesAsync());
    const mod = await WebAssembly.compile(bytes);
    assertZeroImports(mod);
    const instance = await WebAssembly.instantiate(mod, {});
    const exp = instance.exports as unknown as YOctoWasmExports;
    assertAbiVersion(exp);
    cachedTape = new YOctoBinaryTape(exp);
    return exp;
  })();

  if (!wasmBytes) {
    pendingInit = initPromise;
  }

  try {
    return await initPromise;
  } catch (err) {
    if (!wasmBytes) {
      pendingInit = null;
    }
    throw err;
  }
}

export function isYOctoWasmReady(): boolean {
  return cachedTape !== null;
}

/**
 * Synchronously returns the instantiated `YOctoBinaryTape`.
 * In Node/test environments, transparently falls back to synchronous
 * `WebAssembly.Module` + `WebAssembly.Instance` compilation if
 * `ensureYOctoWasmReady()` has not yet been awaited.
 */
export function getYOctoTapeSync(): YOctoBinaryTape {
  if (cachedTape) {
    return cachedTape;
  }

  const bytes = loadWasmBytesSync();
  if (bytes) {
    const mod = new WebAssembly.Module(bytes);
    assertZeroImports(mod);
    const instance = new WebAssembly.Instance(mod, {});
    const exp = instance.exports as unknown as YOctoWasmExports;
    assertAbiVersion(exp);
    cachedTape = new YOctoBinaryTape(exp);
    return cachedTape;
  }

  throw new Error(
    'y-octo-wasm is not initialized yet. Await ensureYOctoWasmReady() during app startup before creating DocSession or ORM adapters.'
  );
}

export function getYOctoWasmSync(): YOctoWasmExports {
  return getYOctoTapeSync().exp;
}

export function trimYOctoScratch(): void {
  getYOctoTapeSync().trimScratch();
}

/**
 * Shrinks Wasm resident scratch buffers back to their trim target.
 */
export function trimYOctoWasmScratch(): void {
  if (cachedTape) {
    cachedTape.trimScratch();
  }
}

/**
 * Resets cached Wasm state (for unit tests only).
 */
export function resetYOctoWasmForTest(): void {
  cachedTape = null;
  pendingInit = null;
}
