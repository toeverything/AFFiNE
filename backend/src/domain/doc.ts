export type SpaceType = 'workspace' | 'userspace';

export type DocLifecycle = 'active' | 'trash' | 'deleted';

export interface DocumentRecord {
  spaceType: SpaceType;
  spaceId: string;
  docId: string;
  snapshot: Uint8Array | null;
  timestamp: number;
  lifecycle: DocLifecycle;
  updateCount: number;
}

export interface StoredDocUpdate {
  clock: number;
  payload: Uint8Array;
  payloadHash: string;
}

export interface LoadedDoc {
  missing: Uint8Array;
  state: Uint8Array;
  timestamp: number;
}

export interface PushResult {
  timestamp: number;
  duplicate: boolean;
  compacted: boolean;
}

export function isSpaceType(value: string): value is SpaceType {
  return value === 'workspace' || value === 'userspace';
}

export function docKey(
  spaceType: string,
  spaceId: string,
  docId: string
): string {
  return `${spaceType}\0${spaceId}\0${docId}`;
}
