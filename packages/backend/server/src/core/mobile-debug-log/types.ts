export interface MobileDebugLogEntry {
  message: string;
  timestampMs?: number;
}

export interface MobileDebugLogBatch {
  clientId: string;
  entries: MobileDebugLogEntry[];
}

export interface MobileDebugLogAck {
  ok: boolean;
  accepted: number;
  dropped: number;
}
