import { TelemetryEvent } from './types';

export type Scalar = string | number;

export type CleanedTelemetryEvent = {
  clientId: string;
  userId?: string;
  eventId: string;
  eventName: string;
  params: Record<string, Scalar>;
  userProperties: Record<string, string>;
  timestampMicros: number;
};

const EVENT_NAME_RE = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const PARAM_NAME_RE = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const USER_PROP_NAME_RE = /^[A-Za-z][A-Za-z0-9_]{0,23}$/;

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
  ['pageLocation', 'page_location'],
  ['pageReferrer', 'page_referrer'],
  ['pagePath', 'page_path'],
  ['pageTitle', 'page_title'],
]);

const USER_PROP_RENAME_MAP = new Map<string, string>([
  ['appVersion', 'app_version'],
  ['editorVersion', 'editor_version'],
  ['environment', 'environment'],
  ['isDesktop', 'is_desktop'],
  ['isMobile', 'is_mobile'],
  ['distribution', 'distribution'],
  ['isSelfHosted', 'is_self_hosted'],
  ['ai', 'ai_enabled'],
  ['pro', 'plan_tier'],
  ['quota', 'quota_tier'],
]);

const DROP_PARAM_SEGMENTS = new Set(['other', 'instruction', 'operation']);
const DROP_MAPPED_PARAMS = new Set(['doc_id', 'workspace_id', 'server_id']);

const PRIORITY_KEYS = new Set([
  'event_id',
  'session_id',
  'session_number',
  'engagement_time_msec',
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
  'page_location',
  'page_path',
  'page_referrer',
  'page_title',
]);

export function cleanTelemetryEvent(
  event: TelemetryEvent,
  {
    userId,
    timestampMicros,
    maxParams = 25,
  }: {
    userId?: string;
    timestampMicros: number;
    maxParams?: number;
  }
): CleanedTelemetryEvent | null {
  if (!event || event.schemaVersion !== 1) {
    return null;
  }

  if (
    !event.clientId ||
    typeof event.clientId !== 'string' ||
    !event.eventId ||
    typeof event.eventId !== 'string' ||
    !event.eventName ||
    typeof event.eventName !== 'string'
  ) {
    return null;
  }

  const mappedEventName = mapEventName(event.eventName);
  if (!EVENT_NAME_RE.test(mappedEventName)) {
    return null;
  }

  const contextParams = buildContextParams(event.context);
  const baseParams = isPlainObject(event.params) ? event.params : {};
  const mergedParams: Record<string, unknown> = {
    ...baseParams,
    ...contextParams,
    eventId: event.eventId,
  };
  if (event.sessionId) {
    mergedParams.sessionId = event.sessionId;
  }

  const contextUserProps = buildContextUserProps(event.context);
  const baseUserProps = isPlainObject(event.userProperties)
    ? event.userProperties
    : {};
  const mergedUserProps = {
    ...contextUserProps,
    ...baseUserProps,
  };

  const sanitizedUserProps = sanitizeUserProperties(mergedUserProps);

  const sanitizedParams =
    mappedEventName === 'page_view'
      ? sanitizePageViewParams(mergedParams, event.context, maxParams)
      : sanitizeParams(mergedParams, maxParams);

  if (!Object.keys(sanitizedParams).length) {
    sanitizedParams.event_id = event.eventId;
  }

  return {
    clientId: event.clientId,
    userId: event.userId ?? userId,
    eventId: event.eventId,
    eventName: mappedEventName,
    params: sanitizedParams,
    userProperties: sanitizedUserProps,
    timestampMicros,
  };
}

function buildContextParams(context?: TelemetryEvent['context']) {
  if (!context) {
    return {};
  }

  const params: Record<string, unknown> = {};
  if (context.url) {
    params.pageLocation = context.url;
  }
  if (context.referrer) {
    params.pageReferrer = context.referrer;
  }
  if (context.locale) {
    params.locale = context.locale;
  }
  if (context.timezone) {
    params.timezone = context.timezone;
  }
  if (context.channel) {
    params.channel = context.channel;
  }
  return params;
}

function buildContextUserProps(context?: TelemetryEvent['context']) {
  if (!context) {
    return {};
  }

  const props: Record<string, unknown> = {};
  if (context.appVersion) {
    props.appVersion = context.appVersion;
  }
  if (context.editorVersion) {
    props.editorVersion = context.editorVersion;
  }
  if (context.environment) {
    props.environment = context.environment;
  }
  if (context.distribution) {
    props.distribution = context.distribution;
  }
  if (context.isDesktop !== undefined) {
    props.isDesktop = context.isDesktop;
  }
  if (context.isMobile !== undefined) {
    props.isMobile = context.isMobile;
  }
  return props;
}

function sanitizePageViewParams(
  input: Record<string, unknown>,
  context: TelemetryEvent['context'] | undefined,
  maxParams: number
) {
  const customParams = { ...input };
  const rawLocation = customParams.location;
  const rawTitle = customParams.title ?? customParams.pageTitle;
  delete customParams.location;
  delete customParams.title;
  delete customParams.pageTitle;

  const { pageLocation, pagePath, pageTitle } = resolvePageViewMeta(
    rawLocation,
    context?.url,
    rawTitle
  );

  const sanitized = sanitizeParams(customParams, Math.max(maxParams - 3, 1));
  const merged: Record<string, Scalar> = { ...sanitized };
  if (pageLocation) {
    merged.page_location = pageLocation;
  }
  if (pagePath) {
    merged.page_path = pagePath;
  }
  if (pageTitle) {
    merged.page_title = pageTitle;
  }

  return merged;
}

function resolvePageViewMeta(
  locationValue: unknown,
  contextUrl: string | undefined,
  titleValue: unknown
) {
  let pageLocation =
    typeof locationValue === 'string' ? locationValue : contextUrl;
  let pagePath: string | undefined;

  if (pageLocation) {
    try {
      const url = contextUrl
        ? new URL(pageLocation, contextUrl)
        : new URL(pageLocation);
      pagePath = url.pathname + url.search;
      if (!pageLocation.startsWith('http')) {
        pageLocation = url.toString();
      }
    } catch {
      if (pageLocation.startsWith('/')) {
        pagePath = pageLocation;
      }
    }
  }

  const pageTitle = typeof titleValue === 'string' ? titleValue : undefined;

  return { pageLocation, pagePath, pageTitle };
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

function toScalar(value: unknown): Scalar | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  if (typeof value === 'string') {
    return value.length > 100 ? value.slice(0, 100) : value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }

  try {
    const serialized = JSON.stringify(value);
    return serialized.length > 100 ? serialized.slice(0, 100) : serialized;
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
      Object.assign(out, flattenProps(value, path));
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

export function sanitizeParams(
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

  mappedEntries.sort((a, b) => {
    const aPriority = PRIORITY_KEYS.has(a[0]);
    const bPriority = PRIORITY_KEYS.has(b[0]);
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

export function sanitizeUserProperties(
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
