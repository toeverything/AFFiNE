import { IncomingHttpHeaders } from 'node:http';

export type OriginRule = string | RegExp | ((origin: string) => boolean);
export type OriginRules = OriginRule | OriginRule[];

function isString(s: OriginRule): s is string {
  return typeof s === 'string' || s instanceof String;
}

export function isOriginAllowed(origin: string, allowedOrigin: OriginRules) {
  if (Array.isArray(allowedOrigin)) {
    for (const allowed of allowedOrigin) {
      if (isOriginAllowed(origin, allowed)) {
        return true;
      }
    }
    return false;
  } else if (isString(allowedOrigin)) {
    return origin === allowedOrigin;
  } else if (allowedOrigin instanceof RegExp) {
    return allowedOrigin.test(origin);
  }
  return allowedOrigin(origin);
}

export function isRefererAllowed(referer: string, allowedOrigin: OriginRules) {
  try {
    const origin = new URL(referer).origin;
    return isOriginAllowed(origin, allowedOrigin);
  } catch {
    return false;
  }
}

const headerFilters = [/^Sec-/i, /^Accept/i, /^User-Agent$/i];

export function cloneHeader(source: IncomingHttpHeaders) {
  const headers: Record<string, string> = {};

  Object.entries(source).forEach(([key, value]) => {
    if (headerFilters.some(filter => filter.test(key))) {
      if (Array.isArray(value)) {
        headers[key] = value.join(',');
      } else if (value) {
        headers[key] = value;
      }
    }
  });

  return headers;
}

export function getCorsHeaders(origin?: string | null): {
  [key: string]: string;
} {
  if (origin) {
    return {
      'Access-Control-Allow-Origin': origin,
    };
  } else {
    return {};
  }
}
