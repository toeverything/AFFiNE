import { URLHelper } from './helpers';

const DEV_LOOPBACK_PROTOCOLS = new Set(['http:', 'https:']);
const DEV_LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const MOBILE_CLIENT_ORIGINS = new Set([
  'https://localhost',
  'capacitor://localhost',
  'ionic://localhost',
]);
const DESKTOP_CLIENT_ORIGINS = new Set([
  'assets://.',
  'assets://another-host',
  // for old versions of client, which use file:// as origin
  'file://',
]);

export const CORS_ALLOWED_METHODS = [
  'GET',
  'HEAD',
  'PUT',
  'PATCH',
  'POST',
  'DELETE',
  'OPTIONS',
];

export const CORS_ALLOWED_HEADERS = [
  'accept',
  'authorization',
  'content-type',
  'x-affine-version',
  'x-operation-name',
  'x-request-id',
  'x-captcha-token',
  'x-captcha-challenge',
  'x-affine-csrf-token',
  'x-requested-with',
  'range',
];

export const CORS_EXPOSED_HEADERS = [
  'content-length',
  'content-range',
  'x-request-id',
];

function normalizeHostname(hostname: string) {
  return hostname.toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
}

function isDevLoopbackOrigin(origin: string) {
  try {
    const parsed = new URL(origin);
    return (
      DEV_LOOPBACK_PROTOCOLS.has(parsed.protocol) &&
      DEV_LOOPBACK_HOSTS.has(normalizeHostname(parsed.hostname))
    );
  } catch {
    return false;
  }
}

function normalizeCorsOrigin(origin: string) {
  try {
    const parsed = new URL(origin);
    // Some websocket clients send ws:// or wss:// as Origin.
    if (parsed.protocol === 'ws:' || parsed.protocol === 'wss:') {
      parsed.protocol = parsed.protocol === 'wss:' ? 'https:' : 'http:';
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

export function buildCorsAllowedOrigins(url: URLHelper) {
  return new Set<string>([
    ...url.allowedOrigins,
    ...MOBILE_CLIENT_ORIGINS,
    ...DESKTOP_CLIENT_ORIGINS,
  ]);
}

export function isCorsOriginAllowed(
  origin: string | undefined | null,
  allowedOrigins: Set<string>
) {
  if (!origin) {
    return true;
  }

  if (allowedOrigins.has(origin)) {
    return true;
  }

  const normalizedOrigin = normalizeCorsOrigin(origin);
  if (normalizedOrigin && allowedOrigins.has(normalizedOrigin)) {
    return true;
  }

  if ((env.dev || env.testing) && isDevLoopbackOrigin(origin)) {
    return true;
  }

  return false;
}

export function corsOriginCallback(
  origin: string | undefined,
  allowedOrigins: Set<string>,
  onBlocked: (origin: string) => void,
  callback: (error: Error | null, allow?: boolean) => void
) {
  if (isCorsOriginAllowed(origin, allowedOrigins)) {
    callback(null, true);
    return;
  }

  const blockedOrigin = origin ?? '<empty>';
  onBlocked(blockedOrigin);
  callback(null, false);
}
