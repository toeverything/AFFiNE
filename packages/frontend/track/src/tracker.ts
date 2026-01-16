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

let enabled = true;
let clientId = readPersistentId(CLIENT_ID_KEY, localStorageSafe());
let sessionId = readPersistentId(SESSION_ID_KEY, sessionStorageSafe());

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
    sessionId = readPersistentId(SESSION_ID_KEY, sessionStorageSafe(), true);
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
    const event = buildEvent(eventName, middlewareProperties);
    void sendTelemetryEvent(event).catch(error => {
      logger.error('failed to send telemetry event', error);
    });
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
    const event = buildEvent('track_pageview', params);
    void sendTelemetryEvent(event).catch(error => {
      logger.error('failed to send telemetry pageview', error);
    });
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
