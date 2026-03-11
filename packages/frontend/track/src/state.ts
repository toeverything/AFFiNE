import { nanoid } from 'nanoid';

export type TrackProperties = Record<string, unknown> | undefined;

export type Middleware = (
  name: string,
  properties?: TrackProperties
) => Record<string, unknown>;

type TrackerState = {
  enabled: boolean;
  clientStorage: Storage | null;
  clientId: string;
  pendingFirstVisit: boolean;
  sessionId: number;
  sessionNumber: number;
  lastActivityMs: number;
  sessionStartSent: boolean;
  engagementTrackingEnabled: boolean;
  visibleSinceMs: number | null;
  pendingEngagementMs: number;
  visibilityChangeHandler: (() => void) | null;
  pageHideHandler: (() => void) | null;
  userId: string | undefined;
  userProperties: Record<string, unknown>;
  middlewares: Set<Middleware>;
};

const CLIENT_ID_KEY = 'affine_telemetry_client_id';

export let trackerState = createTrackerState();

export function resetTrackerState() {
  cleanupTrackerState(trackerState);
  trackerState = createTrackerState();
}

function createTrackerState(): TrackerState {
  const clientStorage = localStorageSafe();
  const hasClientId = !!clientStorage?.getItem(CLIENT_ID_KEY);

  return {
    enabled: true,
    clientStorage,
    clientId: readPersistentId(CLIENT_ID_KEY, clientStorage),
    pendingFirstVisit: !hasClientId,
    sessionId: 0,
    sessionNumber: 0,
    lastActivityMs: 0,
    sessionStartSent: false,
    engagementTrackingEnabled: false,
    visibleSinceMs: null,
    pendingEngagementMs: 0,
    visibilityChangeHandler: null,
    pageHideHandler: null,
    userId: undefined,
    userProperties: {},
    middlewares: new Set<Middleware>(),
  };
}

function cleanupTrackerState(state: TrackerState) {
  if (state.visibilityChangeHandler && typeof document !== 'undefined') {
    document.removeEventListener(
      'visibilitychange',
      state.visibilityChangeHandler
    );
  }
  if (state.pageHideHandler && typeof window !== 'undefined') {
    window.removeEventListener('pagehide', state.pageHideHandler);
  }
}

function readPersistentId(key: string, storage: Storage | null, renew = false) {
  if (!storage) {
    return nanoid();
  }
  if (!renew) {
    const existing = storage.getItem(key);
    if (existing) {
      return existing;
    }
  }
  const id = nanoid();
  try {
    storage.setItem(key, id);
  } catch {
    return id;
  }
  return id;
}

function localStorageSafe(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
