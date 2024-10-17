export interface DocRecord {
  spaceId: string;
  docId: string;
  bin: Uint8Array;
  timestamp: number;
  editor?: string;
}

export interface DocDiff {
  missing: Uint8Array;
  state: Uint8Array;
  timestamp: number;
}

export interface DocUpdate {
  bin: Uint8Array;
  timestamp: number;
  editor?: string;
}

export interface HistoryFilter {
  before?: number;
  limit?: number;
}

export interface Editor {
  name: string;
  avatarUrl: string | null;
}
