type Scalar = string | number;

declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
    dataLayer?: unknown[];
  }
}

const EVENT_NAME_RE = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const PARAM_NAME_RE = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const USER_PROP_NAME_RE = /^[A-Za-z][A-Za-z0-9_]{0,23}$/;
const GA4_MEASUREMENT_ID = BUILD_CONFIG.GA4_MEASUREMENT_ID;
const GTAG_SCRIPT_ID = 'ga4-gtag';

const EVENT_NAME_ALIAS: Record<string, string> = {
  track_pageview: 'page_view',
};

const PARAM_RENAME_MAP = new Map<string, string>([
  ['page', 'ui_page'],
  ['segment', 'ui_segment'],
  ['module', 'ui_module'],
  ['arg', 'ui_arg'],
  ['control', 'ui_control'],
  ['option', 'ui_option'],
  ['key', 'setting_key'],
  ['value', 'setting_value'],
  ['docId', 'doc_id'],
  ['workspaceId', 'workspace_id'],
  ['serverId', 'server_id'],
  ['docType', 'doc_type'],
  ['docCount', 'doc_count'],
  ['unreadCount', 'unread_count'],
  ['withAttachment', 'with_attachment'],
  ['withMention', 'with_mention'],
  ['appName', 'app_name'],
  ['recurring', 'billing_cycle'],
  ['plan', 'plan_name'],
  ['time', 'duration_ms'],
  ['error', 'error_code'],
  ['status', 'result'],
  ['success', 'result'],
  ['to', 'target'],
  ['on', 'enabled'],
]);

const USER_PROP_RENAME_MAP = new Map<string, string>([
  ['appVersion', 'app_version'],
  ['editorVersion', 'editor_version'],
  ['environment', 'environment'],
  ['isDesktop', 'is_desktop'],
  ['distribution', 'distribution'],
  ['isSelfHosted', 'is_self_hosted'],
  ['ai', 'ai_enabled'],
  ['pro', 'plan_tier'],
  ['quota', 'quota_tier'],
]);

const DROP_PARAM_SEGMENTS = new Set(['other', 'instruction', 'operation']);
const DROP_MAPPED_PARAMS = new Set(['doc_id', 'workspace_id', 'server_id']);

const PRIORITY_KEYS = [
  'ui_page',
  'ui_segment',
  'ui_module',
  'ui_control',
  'ui_option',
  'ui_arg',
  'type',
  'method',
  'mode',
  'plan_name',
  'billing_cycle',
  'role',
  'result',
  'error_code',
  'category',
  'doc_type',
  'item',
  'action',
  'target',
  'enabled',
  'setting_key',
  'setting_value',
  'duration_ms',
  'doc_count',
  'unread_count',
  'with_attachment',
  'with_mention',
];

let enabled = true;
let configured = false;

function ensureGtagLoaded(): boolean {
  if (!enabled || !GA4_MEASUREMENT_ID) return false;
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }

  if (!window.gtag) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = (...args: any[]) => {
      window.dataLayer?.push(args);
    };
  }

  if (!document.getElementById(GTAG_SCRIPT_ID)) {
    const script = document.createElement('script');
    script.id = GTAG_SCRIPT_ID;
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(
      GA4_MEASUREMENT_ID
    )}`;
    (document.head || document.body || document.documentElement).appendChild(
      script
    );
  }

  if (!configured) {
    configured = true;
    window.gtag('js', new Date());
    window.gtag('config', GA4_MEASUREMENT_ID, { send_page_view: false });
  }

  return true;
}

function toSnakeCase(input: string): string {
  return input
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z0-9]+)/g, '$1_$2')
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/__+/g, '_')
    .toLowerCase();
}

function toScalar(v: unknown): Scalar | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string') return v.length > 100 ? v.slice(0, 100) : v;
  if (v instanceof Date) return v.toISOString();

  try {
    const s = JSON.stringify(v);
    return s.length > 100 ? s.slice(0, 100) : s;
  } catch {
    return undefined;
  }
}

function normalizeValue(key: string, value: unknown): Scalar | undefined {
  if (key === 'result' && typeof value === 'boolean') {
    return value ? 'success' : 'failure';
  }
  if (key === 'enabled' && typeof value === 'boolean') {
    return value ? 'on' : 'off';
  }
  return toScalar(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') return false;
  if (value instanceof Date) return false;
  if (Array.isArray(value)) return false;
  return Object.getPrototypeOf(value) === Object.prototype;
}

function flattenProps(
  input: Record<string, unknown>,
  prefix = ''
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isPlainObject(value)) {
      const nested = flattenProps(value, path);
      Object.assign(out, nested);
    } else {
      out[path] = value;
    }
  }
  return out;
}

function mapParamKey(path: string): string {
  const segments = path.split('.');
  const mappedSegments = segments.map(
    segment => PARAM_RENAME_MAP.get(segment) ?? segment
  );
  return toSnakeCase(mappedSegments.join('_'));
}

function mapEventName(name: string): string {
  const alias = EVENT_NAME_ALIAS[name];
  return toSnakeCase(alias ?? name);
}

function shouldDropPath(path: string): boolean {
  const segments = path.split('.');
  return segments.some(segment => DROP_PARAM_SEGMENTS.has(segment));
}

function sanitizeParams(
  input: Record<string, unknown>,
  maxParams = 25
): Record<string, Scalar> {
  const flattened = flattenProps(input);
  const mappedEntries: Array<[string, Scalar]> = [];

  for (const [path, value] of Object.entries(flattened)) {
    if (shouldDropPath(path)) continue;

    const mappedKey = mapParamKey(path);
    if (!mappedKey || !PARAM_NAME_RE.test(mappedKey)) continue;
    if (DROP_MAPPED_PARAMS.has(mappedKey)) continue;

    const normalized = normalizeValue(mappedKey, value);
    if (normalized === undefined) continue;

    mappedEntries.push([mappedKey, normalized]);
  }

  const prioritySet = new Set(PRIORITY_KEYS);
  mappedEntries.sort((a, b) => {
    const aPriority = prioritySet.has(a[0]);
    const bPriority = prioritySet.has(b[0]);
    if (aPriority === bPriority) return 0;
    return aPriority ? -1 : 1;
  });

  const out: Record<string, Scalar> = {};
  for (const [key, value] of mappedEntries) {
    if (Object.keys(out).length >= maxParams) break;
    if (key in out) continue;
    out[key] = value;
  }
  return out;
}

function mapUserPropKey(key: string): string | undefined {
  if (key.startsWith('$')) return undefined;
  const mapped = USER_PROP_RENAME_MAP.get(key) ?? key;
  return toSnakeCase(mapped);
}

function sanitizeUserProperties(
  props: Record<string, unknown>
): Record<string, string> {
  const sanitized: Record<string, string> = {};
  for (const [key, value] of Object.entries(props)) {
    const mappedKey = mapUserPropKey(key);
    if (!mappedKey || !USER_PROP_NAME_RE.test(mappedKey)) continue;

    let mappedValue = value;
    if (key === 'pro' && typeof value === 'boolean') {
      mappedValue = value ? 'pro' : 'free';
    }

    const scalar = toScalar(mappedValue);
    if (scalar === undefined) continue;

    const stringValue = String(scalar);
    sanitized[mappedKey] =
      stringValue.length > 36 ? stringValue.slice(0, 36) : stringValue;
  }
  return sanitized;
}

export const ga4 = {
  setEnabled(v: boolean) {
    enabled = v;
    if (enabled) {
      ensureGtagLoaded();
    }
  },

  reset() {
    if (!ensureGtagLoaded()) return;
    window.gtag?.('set', 'user_id', undefined);
    window.gtag?.('set', 'user_properties', {});
  },

  setUserId(userId?: string) {
    if (!ensureGtagLoaded()) return;
    window.gtag?.('set', 'user_id', userId ? String(userId) : undefined);
  },

  setUserProperties(props: Record<string, unknown>) {
    if (!ensureGtagLoaded()) return;
    const sanitized = sanitizeUserProperties(props);
    if (Object.keys(sanitized).length === 0) return;
    window.gtag?.('set', 'user_properties', sanitized);
  },

  track(eventName: string, props: Record<string, unknown> = {}) {
    if (!ensureGtagLoaded()) return;
    const mappedEvent = mapEventName(eventName);
    if (!EVENT_NAME_RE.test(mappedEvent)) return;

    const sanitized = sanitizeParams(props);
    window.gtag?.('event', mappedEvent, sanitized);
  },

  pageview(props: Record<string, unknown> = {}) {
    if (!ensureGtagLoaded()) return;
    const pageLocation =
      typeof props.location === 'string' ? props.location : location.href;
    let pagePath = location.pathname + location.search;
    if (typeof pageLocation === 'string') {
      try {
        const url = new URL(pageLocation, location.origin);
        pagePath = url.pathname + url.search;
      } catch {
        pagePath = location.pathname + location.search;
      }
    }

    const customParams = { ...props };
    delete customParams.location;

    const sanitized = sanitizeParams(customParams, 22);
    window.gtag?.('event', 'page_view', {
      page_location: pageLocation,
      page_path: pagePath,
      page_title: document.title,
      ...sanitized,
    });
  },
};
