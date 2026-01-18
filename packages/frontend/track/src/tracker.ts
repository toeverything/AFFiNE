import { DebugLogger } from '@affine/debug';
import { nanoid } from 'nanoid';

import type { TelemetryEvent } from './telemetry';
import { sendTelemetryEvent, setTelemetryContext } from './telemetry';

const logger = new DebugLogger('telemetry');

type TrackProperties = Record<string, unknown> | undefined;
type RawTrackProperties = Record<string, unknown> | object | undefined;

type Middleware = (
  name: string,
  properties?: TrackProperties
) => Record<string, unknown>;

const CLIENT_ID_KEY = 'affine_telemetry_client_id';
const SESSION_ID_KEY = 'affine_telemetry_session_id';
const SESSION_NUMBER_KEY = 'affine_telemetry_session_number';
const SESSION_NUMBER_CURRENT_KEY = 'affine_telemetry_session_number_current';
const LAST_ACTIVITY_KEY = 'affine_telemetry_last_activity_ms';
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

let enabled = true;
const clientStorage = localStorageSafe();
const hasClientId = clientStorage?.getItem(CLIENT_ID_KEY);
let clientId = readPersistentId(CLIENT_ID_KEY, clientStorage);
let pendingFirstVisit = !hasClientId;
let sessionId = 0;
let sessionNumber = 0;
let lastActivityMs = 0;
let sessionStartSent = false;
let engagementTrackingEnabled = false;
let visibleSinceMs: number | null = null;
let pendingEngagementMs = 0;

let userId: string | undefined;
let userProperties: Record<string, unknown> = {};
const middlewares = new Set<Middleware>();

export const tracker = {
  init() {
    this.register({
      appVersion: BUILD_CONFIG.appVersion,
      environment: BUILD_CONFIG.appBuildType,
      editorVersion: BUILD_CONFIG.editorVersion,
      isDesktop: BUILD_CONFIG.isElectron,
      isMobile: BUILD_CONFIG.isMobileEdition,
      distribution: BUILD_CONFIG.distribution,
    });
  },

  register(props: Record<string, unknown>) {
    userProperties = {
      ...userProperties,
      ...props,
    };
    setTelemetryContext({ userProperties });
  },

  reset() {
    userId = undefined;
    userProperties = {};
    startNewSession(Date.now(), sessionStorageSafe());
    setTelemetryContext(
      { userId, userProperties },
      { replaceUserProperties: true }
    );
    this.init();
  },

  track(eventName: string, properties?: RawTrackProperties) {
    if (!enabled) {
      return;
    }
    const middlewareProperties = Array.from(middlewares).reduce(
      (acc, middleware) => {
        return middleware(eventName, acc);
      },
      normalizeProperties(properties)
    );
    logger.debug('track', eventName, middlewareProperties);
    dispatchEvents(buildQueuedEvents(eventName, middlewareProperties));
  },

  track_pageview(properties?: { location?: string; [key: string]: unknown }) {
    if (!enabled) {
      return;
    }
    const middlewareProperties = Array.from(middlewares).reduce(
      (acc, middleware) => {
        return middleware('track_pageview', acc);
      },
      normalizeProperties(properties)
    );
    const pageLocation =
      typeof middlewareProperties?.location === 'string'
        ? middlewareProperties.location
        : getLocationHref();
    const pageTitle = getDocumentTitle();
    const params = {
      ...middlewareProperties,
      location: pageLocation,
      pageTitle: pageTitle ?? middlewareProperties?.pageTitle,
    };
    logger.debug('track_pageview', params);
    dispatchEvents(buildQueuedEvents('track_pageview', params));
  },

  middleware(cb: Middleware): () => void {
    middlewares.add(cb);
    return () => {
      middlewares.delete(cb);
    };
  },

  opt_out_tracking() {
    enabled = false;
  },

  opt_in_tracking() {
    enabled = true;
  },

  has_opted_in_tracking() {
    return enabled;
  },

  has_opted_out_tracking() {
    return !enabled;
  },

  identify(nextUserId?: string) {
    userId = nextUserId ? String(nextUserId) : undefined;
    setTelemetryContext({ userId });
  },

  get people() {
    return {
      set: (props: Record<string, unknown>) => {
        userProperties = {
          ...userProperties,
          ...props,
        };
        setTelemetryContext({ userProperties });
      },
    };
  },
};

function dispatchEvents(events: TelemetryEvent[]) {
  for (const event of events) {
    void sendTelemetryEvent(event).catch(error => {
      logger.error(`failed to send telemetry event ${event.eventName}`, error);
    });
  }
}

function buildQueuedEvents(
  eventName: string,
  params?: Record<string, unknown>,
  options: { now?: number; engagementMs?: number } = {}
) {
  const now = options.now ?? Date.now();
  const {
    sessionId: nextSessionId,
    sessionNumber: nextSessionNumber,
    preEvents,
  } = prepareSession(now);
  const engagementMs = options.engagementMs ?? consumeEngagementTime(now);
  const eventParams = mergeSessionParams(
    params,
    nextSessionId,
    nextSessionNumber,
    engagementMs
  );
  return [...preEvents, buildEvent(eventName, eventParams)];
}

function prepareSession(now: number) {
  const sessionStorage = sessionStorageSafe();
  if (sessionStorage) {
    const storedSessionId = readPositiveNumber(sessionStorage, SESSION_ID_KEY);
    const storedLastActivity = readPositiveNumber(
      sessionStorage,
      LAST_ACTIVITY_KEY
    );
    const expired =
      !storedSessionId ||
      !storedLastActivity ||
      now - storedLastActivity > SESSION_TIMEOUT_MS;

    if (expired) {
      startNewSession(now, sessionStorage);
    } else {
      sessionId = storedSessionId;
      sessionNumber = readCurrentSessionNumber(sessionStorage, clientStorage);
      updateLastActivity(now, sessionStorage);
    }
  } else {
    const expired =
      !sessionId ||
      !lastActivityMs ||
      now - lastActivityMs > SESSION_TIMEOUT_MS;
    if (expired) {
      startNewSession(now, null);
    } else {
      lastActivityMs = now;
      if (!sessionNumber) {
        sessionNumber = 1;
      }
    }
  }

  const preEvents: TelemetryEvent[] = [];
  if (pendingFirstVisit) {
    pendingFirstVisit = false;
    preEvents.push(
      buildEvent(
        'first_visit',
        mergeSessionParams({}, sessionId, sessionNumber, 1)
      )
    );
  }
  if (!sessionStartSent) {
    sessionStartSent = true;
    preEvents.push(
      buildEvent(
        'session_start',
        mergeSessionParams({}, sessionId, sessionNumber, 1)
      )
    );
  }
  return { sessionId, sessionNumber, preEvents };
}

function mergeSessionParams(
  params: Record<string, unknown> | undefined,
  nextSessionId: number,
  nextSessionNumber: number,
  engagementMs: number
) {
  const merged: Record<string, unknown> = {
    ...(params ?? {}),
  };
  if (Number.isFinite(nextSessionId) && nextSessionId > 0) {
    merged.session_id = nextSessionId;
  }
  if (Number.isFinite(nextSessionNumber) && nextSessionNumber > 0) {
    merged.session_number = nextSessionNumber;
  }
  if (Number.isFinite(engagementMs)) {
    merged.engagement_time_msec = engagementMs;
  }
  return merged;
}

function startNewSession(now: number, sessionStorage: Storage | null) {
  sessionId = Math.floor(now / 1000);
  sessionNumber = incrementSessionNumber(clientStorage, sessionStorage);
  updateLastActivity(now, sessionStorage);
  writeNumber(sessionStorage, SESSION_ID_KEY, sessionId);
  sessionStartSent = false;
  resetEngagementState(now);
}

function updateLastActivity(now: number, sessionStorage: Storage | null) {
  lastActivityMs = now;
  writeNumber(sessionStorage, LAST_ACTIVITY_KEY, now);
}

function consumeEngagementTime(now: number) {
  initEngagementTracking(now);
  if (visibleSinceMs !== null) {
    pendingEngagementMs += now - visibleSinceMs;
    visibleSinceMs = now;
  }
  const engagementMs = Math.max(0, Math.round(pendingEngagementMs));
  pendingEngagementMs = 0;
  return engagementMs;
}

function resetEngagementState(now: number) {
  pendingEngagementMs = 0;
  visibleSinceMs = isDocumentVisible() ? now : null;
}

function initEngagementTracking(now: number) {
  if (engagementTrackingEnabled || typeof document === 'undefined') {
    return;
  }
  engagementTrackingEnabled = true;
  resetEngagementState(now);

  document.addEventListener('visibilitychange', () => {
    const now = Date.now();
    if (visibleSinceMs !== null) {
      pendingEngagementMs += now - visibleSinceMs;
    }
    visibleSinceMs = isDocumentVisible() ? now : null;
    if (!isDocumentVisible()) {
      dispatchUserEngagement(now);
    }
  });

  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', () => {
      dispatchUserEngagement(Date.now());
    });
  }
}

function dispatchUserEngagement(now: number) {
  if (!enabled) {
    return;
  }
  const engagementMs = consumeEngagementTime(now);
  if (engagementMs <= 0) {
    return;
  }
  dispatchEvents(
    buildQueuedEvents(
      'user_engagement',
      { engagement_time_msec: engagementMs },
      { now, engagementMs }
    )
  );
}

function isDocumentVisible() {
  try {
    return (
      typeof document !== 'undefined' && document.visibilityState !== 'hidden'
    );
  } catch {
    return true;
  }
}

function readPositiveNumber(storage: Storage | null, key: string) {
  if (!storage) {
    return undefined;
  }
  const raw = storage.getItem(key);
  if (!raw) {
    return undefined;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return value;
}

function writeNumber(storage: Storage | null, key: string, value: number) {
  if (!storage) {
    return;
  }
  try {
    storage.setItem(key, String(value));
  } catch {
    return;
  }
}

function readCurrentSessionNumber(
  sessionStorage: Storage,
  localStorage: Storage | null
) {
  const current = readPositiveNumber(
    sessionStorage,
    SESSION_NUMBER_CURRENT_KEY
  );
  if (current) {
    return current;
  }

  const fallback = localStorage
    ? (readPositiveNumber(localStorage, SESSION_NUMBER_KEY) ?? 1)
    : sessionNumber || 1;

  writeNumber(sessionStorage, SESSION_NUMBER_CURRENT_KEY, fallback);
  if (localStorage && !readPositiveNumber(localStorage, SESSION_NUMBER_KEY)) {
    writeNumber(localStorage, SESSION_NUMBER_KEY, fallback);
  }
  return fallback;
}

function incrementSessionNumber(
  localStorage: Storage | null,
  sessionStorage: Storage | null
) {
  if (!localStorage) {
    const next = (sessionNumber || 0) + 1;
    writeNumber(sessionStorage, SESSION_NUMBER_CURRENT_KEY, next);
    return next;
  }
  const current = readPositiveNumber(localStorage, SESSION_NUMBER_KEY) ?? 0;
  const next = current + 1;
  writeNumber(localStorage, SESSION_NUMBER_KEY, next);
  writeNumber(sessionStorage, SESSION_NUMBER_CURRENT_KEY, next);
  return next;
}

function buildEvent(
  eventName: string,
  params?: Record<string, unknown>
): TelemetryEvent {
  return {
    schemaVersion: 1,
    eventName,
    params,
    userId,
    userProperties,
    clientId,
    sessionId,
    eventId: nanoid(),
    timestampMicros: Date.now() * 1000,
    context: buildContext(),
  };
}

function buildContext(): TelemetryEvent['context'] {
  return {
    appVersion: BUILD_CONFIG.appVersion,
    editorVersion: BUILD_CONFIG.editorVersion,
    environment: BUILD_CONFIG.appBuildType,
    distribution: BUILD_CONFIG.distribution,
    channel: BUILD_CONFIG.appBuildType as NonNullable<
      TelemetryEvent['context']
    >['channel'],
    isDesktop: BUILD_CONFIG.isElectron,
    isMobile: BUILD_CONFIG.isMobileEdition,
    locale: getLocale(),
    timezone: getTimezone(),
    url: getLocationHref(),
    referrer: getReferrer(),
  };
}

function normalizeProperties(properties?: RawTrackProperties): TrackProperties {
  if (!properties) {
    return undefined;
  }
  return properties as Record<string, unknown>;
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

function sessionStorageSafe(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

function getLocale() {
  try {
    return typeof navigator === 'undefined' ? undefined : navigator.language;
  } catch {
    return undefined;
  }
}

function getTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

function getLocationHref() {
  try {
    return typeof location === 'undefined' ? undefined : location.href;
  } catch {
    return undefined;
  }
}

function getReferrer() {
  try {
    return typeof document === 'undefined' ? undefined : document.referrer;
  } catch {
    return undefined;
  }
}

function getDocumentTitle() {
  try {
    return typeof document === 'undefined' ? undefined : document.title;
  } catch {
    return undefined;
  }
}
