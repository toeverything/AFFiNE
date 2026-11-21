export type SessionUndoMode = 'global' | 'disabled' | 'custom';

export type SessionTxOrigin = 'Tracked' | 'Untracked' | { Named: string };

export type SessionOriginKind =
  | 'LocalTransact'
  | 'LocalUntracked'
  | 'RemoteSync'
  | { Undo: { stack_id: number } }
  | { Redo: { stack_id: number } }
  | { LocalNamed: string }
  | 'FormattingCleanup';

export type YTypeKind =
  | 'Array'
  | 'Map'
  | 'Text'
  | 'XMLElement'
  | 'XmlElement'
  | 'XMLFragment'
  | 'XmlFragment'
  | 'XMLHook'
  | 'XmlHook'
  | 'XMLText'
  | 'XmlText'
  | 'Unknown';

export type TypeIdentity =
  | { Root: string }
  | { Item: { client: number; clock: number } };

export type PathSegment = { Key: string } | { Index: number };

export interface TypePath {
  root: string;
  segments: PathSegment[];
}

export type TypeTarget = { Identity: TypeIdentity } | { Path: TypePath };

export interface TypeStatus {
  alive: boolean;
  kind: YTypeKind | null;
  path: TypePath | null;
}

export type TextDeltaOp =
  | {
      insert: string | unknown[] | Record<string, unknown>;
      format?: Record<string, unknown>;
    }
  | {
      retain: number;
      format?: Record<string, unknown>;
    }
  | {
      delete: number;
    };

export type SessionValue =
  | { Any: unknown }
  | { Map: [string, SessionValue][] }
  | { Array: SessionValue[] }
  | { Text: TextDeltaOp[] }
  | { Doc: { guid: string; gc: boolean } }
  | {
      XmlElement: {
        tag: string;
        attrs?: [string, unknown][];
        children?: SessionValue[];
      };
    }
  | { XmlFragment: SessionValue[] }
  | { XmlText: TextDeltaOp[] }
  | {
      XmlHook: {
        name: string;
        entries?: [string, SessionValue][];
      };
    };

export type SessionReadValue =
  | { Any: unknown }
  | { Map: TypeIdentity }
  | { Array: TypeIdentity }
  | { Text: TypeIdentity }
  | { Doc: { guid: string; gc: boolean } }
  | { XmlElement: { tag: string; identity: TypeIdentity } }
  | { XmlFragment: TypeIdentity }
  | { XmlText: TypeIdentity }
  | { XmlHook: { name: string; identity: TypeIdentity } };

export interface SessionChangedType {
  identity: TypeIdentity;
  path: TypePath | null;
  keys: string[];
}

export interface SessionCommit {
  revision: number;
  update: Uint8Array;
  is_local: boolean;
  origin_kind: SessionOriginKind;
  changed: SessionChangedType[];
  subdocs_added: string[];
  subdocs_removed: string[];
  can_undo: boolean;
  can_redo: boolean;
  selection_meta: Uint8Array | null;
}

export interface RelativePositionResult {
  bytes: Uint8Array;
}

export interface AbsolutePositionResult {
  type: TypeIdentity;
  index: number;
  assoc: number;
}

export interface AwarenessStateEntry {
  clock: number;
  content: string;
  deleted: boolean;
}

export interface AwarenessChangeEvent {
  added: number[];
  updated: number[];
  removed: number[];
}

export interface YOctoWasmExports {
  memory: WebAssembly.Memory;
  wasm_abi_version(): number;
  in_buf_ensure(minCap: number): number;
  runtime_trim_scratch(): void;
  out_buf_ptr(): number;
  out_buf_len(): number;
  error_ptr(): number;
  error_len(): number;
  wire_validate_update_v1(len: number): number;
  wire_encode_sv_from_update_v1(len: number): number;
  wire_diff_update_v1(updateLen: number, svLen: number): number;
  wire_merge_updates_v1(len: number): number;
  wire_revert_update_v1(curLen: number, tgtLen: number): number;
  session_create(
    clientId: bigint,
    guidLen: number,
    gc: number,
    undoMode: number,
    captureTimeoutMs: bigint
  ): number;
  session_free(handle: number): void;
  session_begin_tx(handle: number, origin: number): number;
  session_commit_tx(handle: number): number;
  session_tx_depth(handle: number): number;
  session_can_undo(handle: number): number;
  session_can_redo(handle: number): number;
  session_text_insert_root(
    handle: number,
    rootLen: number,
    index: number,
    textLen: number
  ): number;
  session_text_insert_id(
    handle: number,
    clientLo: number,
    clientHi: number,
    clock: number,
    index: number,
    textLen: number
  ): number;
  session_text_remove_id(
    handle: number,
    clientLo: number,
    clientHi: number,
    clock: number,
    index: number,
    len: number
  ): number;
  session_map_set_f64_id(
    handle: number,
    clientLo: number,
    clientHi: number,
    clock: number,
    keyLen: number,
    value: number
  ): number;
  session_exec(handle: number, len: number): number;
  session_apply_update_v1(handle: number, len: number): number;
  session_encode_update_v1(handle: number): number;
  session_encode_sv_v1(handle: number): number;
  session_encode_diff_v1(handle: number, svLen: number): number;
  awareness_create(localId: bigint): number;
  awareness_free(handle: number): void;
  awareness_local_id(handle: number): bigint;
  awareness_set_local_id(handle: number, newLocalId: bigint): number;
  awareness_set_local_state(handle: number, len: number): number;
  awareness_clear_local_state(handle: number): number;
  awareness_get_states(handle: number): number;
  awareness_encode_update(
    handle: number,
    hasFilter: number,
    clientsCount: number
  ): number;
  awareness_apply_update_v1(handle: number, len: number): number;
}
