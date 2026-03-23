import { DebugLogger } from '@affine/debug';
import { nanoid } from 'nanoid';

import { type Middleware, trackerState, type TrackProperties } from './state';
import type { TelemetryEvent } from './telemetry';
import { sendTelemetryEvent, setTelemetryContext } from './telemetry';

const logger = new DebugLogger('telemetry');

type RawTrackProperties = Record<string, unknown> | object | undefined;

const SESSION_ID_KEY = 'affine_telemetry_session_id';
const SESSION_NUMBER_KEY = 'affine_telemetry_session_number';
const SESSION_NUMBER_CURRENT_KEY = 'affine_telemetry_session_number_current';
const LAST_ACTIVITY_KEY = 'affine_telemetry_last_activity_ms';
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

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
    trackerState.userProperties = {
      ...trackerState.userProperties,
      ...props,
    };
    setTelemetryContext({ userProperties: trackerState.userProperties });
  },

  reset() {
    trackerState.userId = undefined;
    trackerState.userProperties = {};
    startNewSession(Date.now(), sessionStorageSafe());
    setTelemetryContext(
      {
        userId: trackerState.userId,
        userProperties: trackerState.userProperties,
      },
      { replaceUserProperties: true }
    );
    this.init();
  },

  track(eventName: string, properties?: RawTrackProperties) {
    if (!trackerState.enabled) {
      return;
    }
    const middlewareProperties = Array.from(trackerState.middlewares).reduce(
      (acc, middleware) => {
        return middleware(eventName, acc);
      },
      normalizeProperties(properties)
    );
    logger.debug('track', eventName, middlewareProperties);
    dispatchEvents(buildQueuedEvents(eventName, middlewareProperties));
  },

  track_pageview(properties?: { location?: string; [key: string]: unknown }) {
    if (!trackerState.enabled) {
      return;
    }
    const middlewareProperties = Array.from(trackerState.middlewares).reduce(
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
    trackerState.middlewares.add(cb);
    return () => {
      trackerState.middlewares.delete(cb);
    };
  },

  opt_out_tracking() {
    trackerState.enabled = false;
  },

  opt_in_tracking() {
    trackerState.enabled = true;
  },

  has_opted_in_tracking() {
    return trackerState.enabled;
  },

  has_opted_out_tracking() {
    return !trackerState.enabled;
  },

  identify(nextUserId?: string) {
    trackerState.userId = nextUserId ? String(nextUserId) : undefined;
    setTelemetryContext({ userId: trackerState.userId });
  },

  get people() {
    return {
      set: (props: Record<string, unknown>) => {
        trackerState.userProperties = {
          ...trackerState.userProperties,
          ...props,
        };
        setTelemetryContext({ userProperties: trackerState.userProperties });
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
      trackerState.sessionId = storedSessionId;
      trackerState.sessionNumber = readCurrentSessionNumber(
        sessionStorage,
        trackerState.clientStorage
      );
      updateLastActivity(now, sessionStorage);
    }
  } else {
    const expired =
      !trackerState.sessionId ||
      !trackerState.lastActivityMs ||
      now - trackerState.lastActivityMs > SESSION_TIMEOUT_MS;
    if (expired) {
      startNewSession(now, null);
    } else {
      trackerState.lastActivityMs = now;
      if (!trackerState.sessionNumber) {
        trackerState.sessionNumber = 1;
      }
    }
  }

  const preEvents: TelemetryEvent[] = [];
  if (trackerState.pendingFirstVisit) {
    trackerState.pendingFirstVisit = false;
    preEvents.push(
      buildEvent(
        'first_visit',
        mergeSessionParams(
          {},
          trackerState.sessionId,
          trackerState.sessionNumber,
          1
        )
      )
    );
  }
  if (!trackerState.sessionStartSent) {
    trackerState.sessionStartSent = true;
    preEvents.push(
      buildEvent(
        'session_start',
        mergeSessionParams(
          {},
          trackerState.sessionId,
          trackerState.sessionNumber,
          1
        )
      )
    );
  }
  return {
    sessionId: trackerState.sessionId,
    sessionNumber: trackerState.sessionNumber,
    preEvents,
  };
}

function mergeSessionParams(
  params: Record<string, unknown> | undefined,
  nextSessionId: number,
  nextSessionNumber: number,
  engagementMs: number
) {
  const merged: Record<string, unknown> = {
    ...params,
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
  trackerState.sessionId = Math.floor(now / 1000);
  trackerState.sessionNumber = incrementSessionNumber(
    trackerState.clientStorage,
    sessionStorage
  );
  updateLastActivity(now, sessionStorage);
  writeNumber(sessionStorage, SESSION_ID_KEY, trackerState.sessionId);
  trackerState.sessionStartSent = false;
  resetEngagementState(now);
}

function updateLastActivity(now: number, sessionStorage: Storage | null) {
  trackerState.lastActivityMs = now;
  writeNumber(sessionStorage, LAST_ACTIVITY_KEY, now);
}

function consumeEngagementTime(now: number) {
  initEngagementTracking(now);
  if (trackerState.visibleSinceMs !== null) {
    trackerState.pendingEngagementMs += now - trackerState.visibleSinceMs;
    trackerState.visibleSinceMs = now;
  }
  const engagementMs = Math.max(
    0,
    Math.round(trackerState.pendingEngagementMs)
  );
  trackerState.pendingEngagementMs = 0;
  return engagementMs;
}

function resetEngagementState(now: number) {
  trackerState.pendingEngagementMs = 0;
  trackerState.visibleSinceMs = isDocumentVisible() ? now : null;
}

function initEngagementTracking(now: number) {
  if (
    trackerState.engagementTrackingEnabled ||
    typeof document === 'undefined'
  ) {
    return;
  }
  trackerState.engagementTrackingEnabled = true;
  resetEngagementState(now);

  trackerState.visibilityChangeHandler = () => {
    const now = Date.now();
    if (trackerState.visibleSinceMs !== null) {
      trackerState.pendingEngagementMs += now - trackerState.visibleSinceMs;
    }
    trackerState.visibleSinceMs = isDocumentVisible() ? now : null;
    if (!isDocumentVisible()) {
      dispatchUserEngagement(now);
    }
  };
  document.addEventListener(
    'visibilitychange',
    trackerState.visibilityChangeHandler
  );

  if (typeof window !== 'undefined') {
    trackerState.pageHideHandler = () => {
      dispatchUserEngagement(Date.now());
    };
    window.addEventListener('pagehide', trackerState.pageHideHandler);
  }
}

function dispatchUserEngagement(now: number) {
  if (!trackerState.enabled) {
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
    : trackerState.sessionNumber || 1;

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
    const next = (trackerState.sessionNumber || 0) + 1;
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
    userId: trackerState.userId,
    userProperties: trackerState.userProperties,
    clientId: trackerState.clientId,
    sessionId: trackerState.sessionId,
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
