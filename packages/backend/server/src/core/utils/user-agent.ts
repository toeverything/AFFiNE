import type { IncomingHttpHeaders } from 'node:http';

import isMobile from 'is-mobile';

export type UserAgentHeader = IncomingHttpHeaders['user-agent'];

export type UserAgentDeviceType = 'desktop' | 'mobile';

export interface ParsedUserAgent {
  readonly ua: string;
  readonly deviceType: UserAgentDeviceType;
  readonly isMobile: boolean;
}

type HeaderValue = string | string[] | undefined;

const USER_AGENT_MAX_LENGTH = 512;
const USER_AGENT_CACHE_MAX_SIZE = 1024;

const CLIENT_HINT_MOBILE_TRUE = new Set(['?1', '1', 'true']);
const MOBILE_PLATFORM_HINTS = new Set(['android', 'ios', 'ipados']);

const EMPTY_USER_AGENT: ParsedUserAgent = {
  ua: '',
  deviceType: 'desktop',
  isMobile: false,
};

const parsedUserAgentCache = new Map<string, ParsedUserAgent>();

interface UserAgentSignals {
  ua: string;
  clientHintMobile?: boolean;
  clientHintPlatform?: string;
}

function pickHeaderValue(value: HeaderValue): string {
  if (typeof value === 'string') {
    return value;
  }

  if (!Array.isArray(value)) {
    return '';
  }

  return value.find(item => typeof item === 'string' && item.length > 0) ?? '';
}

function normalizeHeaderValue(value: HeaderValue): string {
  const header = pickHeaderValue(value);
  if (!header) return '';
  return header.trim().toLowerCase();
}

function unquoteHeaderValue(value: string): string {
  if (!value) return value;

  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1);
  }

  return value;
}

function normalizeUserAgentHeader(value: UserAgentHeader): string {
  const normalized = normalizeHeaderValue(value);
  if (!normalized) return '';
  if (normalized.length <= USER_AGENT_MAX_LENGTH) return normalized;
  return normalized.slice(0, USER_AGENT_MAX_LENGTH);
}

function parseClientHintMobile(value: HeaderValue): boolean | undefined {
  const normalized = unquoteHeaderValue(normalizeHeaderValue(value));
  if (!normalized) return;
  if (CLIENT_HINT_MOBILE_TRUE.has(normalized)) return true;
  return false;
}

function parseClientHintPlatform(value: HeaderValue): string | undefined {
  const normalized = unquoteHeaderValue(normalizeHeaderValue(value));
  if (!normalized) {
    return;
  }

  return normalized;
}

function parseUserAgentSignals(headers: IncomingHttpHeaders): UserAgentSignals {
  return {
    ua: normalizeUserAgentHeader(headers['user-agent']),
    clientHintMobile: parseClientHintMobile(headers['sec-ch-ua-mobile']),
    clientHintPlatform: parseClientHintPlatform(headers['sec-ch-ua-platform']),
  };
}

function getDeviceType(signals: UserAgentSignals): UserAgentDeviceType {
  if (signals.clientHintMobile !== undefined) {
    return signals.clientHintMobile ? 'mobile' : 'desktop';
  }

  if (
    signals.clientHintPlatform &&
    MOBILE_PLATFORM_HINTS.has(signals.clientHintPlatform)
  ) {
    return 'mobile';
  }

  if (!signals.ua) {
    return 'desktop';
  }

  const mobile = isMobile({
    ua: signals.ua,
    tablet: true,
    featureDetect: false,
  });
  return mobile ? 'mobile' : 'desktop';
}

function getCacheKey(signals: UserAgentSignals): string {
  const hintMobile =
    signals.clientHintMobile === undefined
      ? ''
      : signals.clientHintMobile
        ? '1'
        : '0';
  const hintPlatform = signals.clientHintPlatform ?? '';
  return `${signals.ua}|${hintMobile}|${hintPlatform}`;
}

function getCachedParsedUserAgent(
  cacheKey: string
): ParsedUserAgent | undefined {
  const cached = parsedUserAgentCache.get(cacheKey);
  if (!cached) return;

  // Keep recently-used entries hot in the bounded cache.
  parsedUserAgentCache.delete(cacheKey);
  parsedUserAgentCache.set(cacheKey, cached);
  return cached;
}

function cacheParsedUserAgent(
  cacheKey: string,
  parsedUserAgent: ParsedUserAgent
) {
  if (parsedUserAgentCache.has(cacheKey)) {
    parsedUserAgentCache.delete(cacheKey);
  } else if (parsedUserAgentCache.size >= USER_AGENT_CACHE_MAX_SIZE) {
    const oldestUserAgent = parsedUserAgentCache.keys().next();
    if (!oldestUserAgent.done) {
      parsedUserAgentCache.delete(oldestUserAgent.value);
    }
  }

  parsedUserAgentCache.set(cacheKey, parsedUserAgent);
}

function parseUserAgentWithSignals(signals: UserAgentSignals): ParsedUserAgent {
  const cacheKey = getCacheKey(signals);
  const cached = getCachedParsedUserAgent(cacheKey);
  if (cached) return cached;

  const deviceType = getDeviceType(signals);
  const parsed: ParsedUserAgent = {
    ua: signals.ua,
    deviceType,
    isMobile: deviceType === 'mobile',
  };

  cacheParsedUserAgent(cacheKey, parsed);
  return parsed;
}

export function parseUserAgent(
  userAgentHeader: UserAgentHeader
): ParsedUserAgent {
  const ua = normalizeUserAgentHeader(userAgentHeader);
  if (!ua) {
    return EMPTY_USER_AGENT;
  }

  return parseUserAgentWithSignals({ ua });
}

export function isMobileUserAgent(userAgentHeader: UserAgentHeader): boolean {
  return parseUserAgent(userAgentHeader).isMobile;
}

export function parseRequestUserAgent(
  headers: IncomingHttpHeaders
): ParsedUserAgent {
  const signals = parseUserAgentSignals(headers);
  if (
    !signals.ua &&
    signals.clientHintMobile === undefined &&
    !signals.clientHintPlatform
  ) {
    return EMPTY_USER_AGENT;
  }

  return parseUserAgentWithSignals(signals);
}

export function isMobileRequest(headers: IncomingHttpHeaders): boolean {
  return parseRequestUserAgent(headers).isMobile;
}
