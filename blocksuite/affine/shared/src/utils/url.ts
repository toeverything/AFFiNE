// https://www.iana.org/assignments/uri-schemes/uri-schemes.xhtml
const ALLOWED_SCHEMES = new Set([
  'http',
  'https',
  'ftp',
  'sftp',
  'mailto',
  'tel',
]);

// https://publicsuffix.org/
const TLD_REGEXP = /(?:\.[a-zA-Z]+)?(\.[a-zA-Z]{2,})$/;

const IPV4_ADDR_REGEXP =
  /^(25[0-5]|2[0-4]\d|[01]?\d\d?)(\.(25[0-5]|2[0-4]\d|[01]?\d\d?)){3}$/;

const toURL = (str: string) => {
  try {
    if (!URL.canParse(str)) return null;

    return new URL(str);
  } catch {
    return null;
  }
};

function resolveURL(str: string, baseUrl: string, padded = false) {
  const url = toURL(str);
  if (!url) return null;

  const protocol = url.protocol.substring(0, url.protocol.length - 1);
  const hostname = url.hostname;
  const origin = url.origin;

  let allowed = ALLOWED_SCHEMES.has(protocol);
  if (allowed && hostname.includes('.')) {
    allowed =
      origin === baseUrl ||
      TLD_REGEXP.test(hostname) ||
      (padded ? false : IPV4_ADDR_REGEXP.test(hostname));
  }

  return { url, allowed };
}

export function normalizeUrl(str: string) {
  str = str.trim();

  let url = toURL(str);

  if (!url) {
    const hasScheme = str.match(/^https?:\/\//);

    if (!hasScheme) {
      const dotIdx = str.indexOf('.');
      if (dotIdx > 0 && dotIdx < str.length - 1) {
        url = toURL(`https://${str}`);
      }
    }
  }

  // Formatted
  if (url) {
    if (!str.endsWith('/') && url.href.endsWith('/')) {
      return url.href.substring(0, url.href.length - 1);
    }
    return url.href;
  }

  return str;
}

/**
 * Assume user will input a url, we just need to check if it is valid.
 *
 * For more detail see https://www.ietf.org/rfc/rfc1738.txt
 */
export function isValidUrl(str: string, baseUrl = location.origin) {
  str = str.trim();

  let result = resolveURL(str, baseUrl);

  if (result && !result.allowed) return false;

  if (!result) {
    const hasScheme = str.match(/^https?:\/\//);
    if (!hasScheme) {
      const dotIdx = str.indexOf('.');
      if (dotIdx > 0 && dotIdx < str.length - 1) {
        result = resolveURL(`https://${str}`, baseUrl, true);
      }
    }
  }

  return result?.allowed ?? false;
}

const URL_SCHEME_IN_TOKEN_REGEXP =
  /(?:https?:\/\/|ftp:\/\/|sftp:\/\/|mailto:|tel:|www\.)/i;

const URL_LEADING_DELIMITER_REGEXP = /^[-([{<'"~]+/;

const URL_TRAILING_DELIMITER_REGEXP = /[)\]}>.,;:!?'"]+$/;

export type UrlTextSegment = {
  text: string;
  link?: string;
};

function appendUrlTextSegment(
  segments: UrlTextSegment[],
  segment: UrlTextSegment
) {
  if (!segment.text) return;
  const last = segments[segments.length - 1];
  if (last && !last.link && !segment.link) {
    last.text += segment.text;
    return;
  }
  segments.push(segment);
}

function splitTokenByUrl(token: string, baseUrl: string): UrlTextSegment[] {
  const schemeMatch = token.match(URL_SCHEME_IN_TOKEN_REGEXP);
  const schemeIndex = schemeMatch?.index;
  if (typeof schemeIndex === 'number' && schemeIndex > 0) {
    return [
      { text: token.slice(0, schemeIndex) },
      ...splitTokenByUrl(token.slice(schemeIndex), baseUrl),
    ];
  }

  const leading = token.match(URL_LEADING_DELIMITER_REGEXP)?.[0] ?? '';
  const withoutLeading = token.slice(leading.length);
  const trailing =
    withoutLeading.match(URL_TRAILING_DELIMITER_REGEXP)?.[0] ?? '';
  const core = trailing
    ? withoutLeading.slice(0, withoutLeading.length - trailing.length)
    : withoutLeading;

  if (core && isValidUrl(core, baseUrl)) {
    const segments: UrlTextSegment[] = [];
    appendUrlTextSegment(segments, { text: leading });
    appendUrlTextSegment(segments, { text: core, link: normalizeUrl(core) });
    appendUrlTextSegment(segments, { text: trailing });
    return segments;
  }

  return [{ text: token }];
}

/**
 * Split plain text into mixed segments, where only URL segments carry link metadata.
 * This is used by paste handlers so text like `example:https://google.com` keeps
 * normal text while only URL parts are linkified.
 */
export function splitTextByUrl(text: string, baseUrl = location.origin) {
  const chunks = text.match(/\s+|\S+/g);
  if (!chunks) {
    return [];
  }

  const segments: UrlTextSegment[] = [];
  chunks.forEach(chunk => {
    if (/^\s+$/.test(chunk)) {
      appendUrlTextSegment(segments, { text: chunk });
      return;
    }
    splitTokenByUrl(chunk, baseUrl).forEach(segment => {
      appendUrlTextSegment(segments, segment);
    });
  });
  return segments;
}

// https://en.wikipedia.org/wiki/Top-level_domain
const COMMON_TLDS = new Set([
  'cat',
  'co',
  'com',
  'de',
  'dev',
  'edu',
  'eu',
  'gov',
  'info',
  'io',
  'jp',
  'me',
  'mil',
  'moe',
  'net',
  'org',
  'pro',
  'ru',
  'top',
  'uk',
  'xyz',
]);

function isCommonTLD(url: URL) {
  const tld = url.hostname.split('.').pop() ?? '';
  return COMMON_TLDS.has(tld);
}

/**
 * Assuming the user will input anything, we need to check rigorously.
 */
export function isStrictUrl(str: string) {
  try {
    if (!isValidUrl(str)) {
      return false;
    }

    const url = new URL(normalizeUrl(str));

    return isCommonTLD(url);
  } catch {
    return false;
  }
}

export function isUrlInClipboard(clipboardData: DataTransfer) {
  const url = clipboardData.getData('text/plain');
  return isValidUrl(url);
}

export function getHostName(link: string) {
  try {
    const url = new URL(link);
    return url.hostname || url.pathname;
  } catch {
    return link;
  }
}
