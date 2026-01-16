export type TelemetryEvent = {
  schemaVersion: 1;
  eventName: string;
  params?: Record<string, unknown>;
  userProperties?: Record<string, unknown>;
  userId?: string;
  clientId: string;
  sessionId?: string | number;
  eventId: string;
  timestampMicros?: number;
  context?: {
    appVersion?: string;
    editorVersion?: string;
    environment?: string;
    distribution?: string;
    channel?: 'stable' | 'beta' | 'internal' | 'canary';
    isDesktop?: boolean;
    isMobile?: boolean;
    locale?: string;
    timezone?: string;
    url?: string;
    referrer?: string;
  };
};

export type TelemetryBatch = {
  schemaVersion: 1;
  transport: 'http' | 'ws';
  sentAt: number;
  events: TelemetryEvent[];
};

export type TelemetryAck =
  | { ok: true; accepted: number; dropped: number }
  | { ok: false; error: { name: string; message: string } };

export interface TelemetryContext {
  isAuthed: boolean;
  isSelfHosted: boolean;
  channel: 'stable' | 'beta' | 'internal' | 'canary';
  userId?: string;
  userProperties?: Record<string, unknown>;
  officialEndpoint: string;
}

export interface TelemetryQueueState {
  size: number;
  lastError?: string;
  nextRetryAt?: number;
}
