import * as dns from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { Readable } from 'node:stream';

import { ResponseTooLargeError, SsrfBlockedError } from '../error/errors.gen';
import { OneMinute } from './unit';

const DEFAULT_ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const BLOCKED_IPS = new BlockList();
const ALLOWED_IPV6 = new BlockList();

export type DnsLookup = typeof dns.lookup;
let dnsLookup: DnsLookup = dns.lookup;

export function __setDnsLookupForTests(lookup: DnsLookup) {
  dnsLookup = lookup;
}

export function __resetDnsLookupForTests() {
  dnsLookup = dns.lookup;
}

export type SSRFBlockReason =
  | 'invalid_url'
  | 'disallowed_protocol'
  | 'url_has_credentials'
  | 'blocked_hostname'
  | 'unresolvable_hostname'
  | 'blocked_ip'
  | 'too_many_redirects';

type SsrfErrorContext = { url?: string; hostname?: string; address?: string };

function createSsrfBlockedError(
  reason: SSRFBlockReason,
  context?: SsrfErrorContext
) {
  const err = new SsrfBlockedError({ reason });
  // For logging/debugging only (not part of UserFriendlyError JSON).
  (err as any).context = context;
  return err;
}

export interface SSRFProtectionOptions {
  allowedProtocols?: ReadonlySet<string>;
  /**
   * Allow fetching private/reserved IPs when URL.origin is allowlisted.
   * Defaults to an empty allowlist (i.e. private IPs are blocked).
   */
  allowPrivateOrigins?: ReadonlySet<string>;
}

function stripZoneId(address: string) {
  const idx = address.indexOf('%');
  return idx === -1 ? address : address.slice(0, idx);
}

// IPv4: RFC1918 + loopback + link-local + CGNAT + special/reserved
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['100.64.0.0', 10], // CGNAT
  ['192.0.0.0', 24],
  ['192.0.2.0', 24], // TEST-NET-1
  ['198.51.100.0', 24], // TEST-NET-2
  ['203.0.113.0', 24], // TEST-NET-3
  ['198.18.0.0', 15], // benchmark
  ['192.88.99.0', 24], // 6to4 relay
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved (includes broadcast)
] as const) {
  BLOCKED_IPS.addSubnet(network, prefix, 'ipv4');
}

// IPv6: block loopback/unspecified/link-local/ULA/multicast/doc; allow only global unicast.
BLOCKED_IPS.addAddress('::', 'ipv6');
BLOCKED_IPS.addAddress('::1', 'ipv6');
BLOCKED_IPS.addSubnet('ff00::', 8, 'ipv6'); // multicast
BLOCKED_IPS.addSubnet('fc00::', 7, 'ipv6'); // unique local
BLOCKED_IPS.addSubnet('fe80::', 10, 'ipv6'); // link-local
BLOCKED_IPS.addSubnet('2001:db8::', 32, 'ipv6'); // documentation
ALLOWED_IPV6.addSubnet('2000::', 3, 'ipv6'); // global unicast

function extractEmbeddedIPv4FromIPv6(address: string): string | null {
  if (!address.includes('.')) {
    return null;
  }
  const idx = address.lastIndexOf(':');
  if (idx === -1) {
    return null;
  }
  const tail = address.slice(idx + 1);
  return isIP(tail) === 4 ? tail : null;
}

function isBlockedIpAddress(address: string): boolean {
  const ip = stripZoneId(address);
  const family = isIP(ip);
  if (family === 4) {
    return BLOCKED_IPS.check(ip, 'ipv4');
  }
  if (family === 6) {
    const embeddedV4 = extractEmbeddedIPv4FromIPv6(ip);
    if (embeddedV4) {
      return isBlockedIpAddress(embeddedV4);
    }
    if (!ALLOWED_IPV6.check(ip, 'ipv6')) {
      return true;
    }
    return BLOCKED_IPS.check(ip, 'ipv6');
  }
  return true;
}

async function resolveHostAddresses(hostname: string): Promise<string[]> {
  // Normalize common localhost aliases without DNS.
  const lowered = hostname.toLowerCase();
  if (lowered === 'localhost' || lowered.endsWith('.localhost')) {
    return ['127.0.0.1', '::1'];
  }

  const results = await dnsLookup(hostname, {
    all: true,
    verbatim: true,
  });
  return results.map(r => r.address);
}

export async function assertSsrFSafeUrl(
  rawUrl: string | URL,
  options: SSRFProtectionOptions = {}
): Promise<URL> {
  const allowedProtocols =
    options.allowedProtocols ?? DEFAULT_ALLOWED_PROTOCOLS;

  let url: URL;
  try {
    url = rawUrl instanceof URL ? rawUrl : new URL(rawUrl);
  } catch {
    throw createSsrfBlockedError('invalid_url', {
      url: typeof rawUrl === 'string' ? rawUrl : undefined,
    });
  }

  if (!allowedProtocols.has(url.protocol)) {
    throw createSsrfBlockedError('disallowed_protocol', {
      url: url.toString(),
    });
  }

  if (url.username || url.password) {
    throw createSsrfBlockedError('url_has_credentials', {
      url: url.toString(),
    });
  }

  const hostname = url.hostname;
  if (!hostname) {
    throw createSsrfBlockedError('blocked_hostname', { url: url.toString() });
  }

  const allowPrivate =
    options.allowPrivateOrigins && options.allowPrivateOrigins.has(url.origin);

  // IP literal
  if (isIP(hostname)) {
    if (isBlockedIpAddress(hostname) && !allowPrivate) {
      throw createSsrfBlockedError('blocked_ip', {
        url: url.toString(),
        address: hostname,
      });
    }
    return url;
  }

  let addresses: string[];
  try {
    addresses = await resolveHostAddresses(hostname);
  } catch (error) {
    throw createSsrfBlockedError('unresolvable_hostname', {
      url: url.toString(),
      hostname,
    });
  }

  if (addresses.length === 0) {
    throw createSsrfBlockedError('unresolvable_hostname', {
      url: url.toString(),
      hostname,
    });
  }

  for (const address of addresses) {
    if (isBlockedIpAddress(address) && !allowPrivate) {
      throw createSsrfBlockedError('blocked_ip', {
        url: url.toString(),
        hostname,
        address,
      });
    }
  }

  return url;
}

export interface SafeFetchOptions extends SSRFProtectionOptions {
  timeoutMs?: number;
  maxRedirects?: number;
}

export async function safeFetch(
  rawUrl: string | URL,
  init: RequestInit = {},
  options: SafeFetchOptions = {}
): Promise<Response> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const maxRedirects = options.maxRedirects ?? 3;

  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = init.signal
    ? AbortSignal.any([init.signal, timeoutSignal])
    : timeoutSignal;

  let current = await assertSsrFSafeUrl(rawUrl, options);
  let redirects = 0;

  // Always handle redirects manually (SSRF-safe on each hop).
  let requestInit: RequestInit = {
    ...init,
    redirect: 'manual',
    signal,
  };

  while (true) {
    const response = await fetch(current, requestInit);

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        return response;
      }

      // Drain/cancel body before following redirect to avoid leaking resources.
      try {
        await response.body?.cancel();
      } catch {
        // ignore
      }

      if (redirects >= maxRedirects) {
        throw createSsrfBlockedError('too_many_redirects', {
          url: current.toString(),
        });
      }

      const next = new URL(location, current);
      current = await assertSsrFSafeUrl(next, options);
      redirects += 1;

      // 303 forces GET semantics
      if (
        response.status === 303 &&
        requestInit.method &&
        requestInit.method !== 'GET'
      ) {
        requestInit = { ...requestInit, method: 'GET', body: undefined };
      }

      continue;
    }

    return response;
  }
}

export async function readResponseBufferWithLimit(
  response: Response,
  limitBytes: number
): Promise<Buffer> {
  const rawLen = response.headers.get('content-length');
  if (rawLen) {
    const len = Number.parseInt(rawLen, 10);
    if (Number.isFinite(len) && len > limitBytes) {
      try {
        await response.body?.cancel();
      } catch {
        // ignore
      }
      throw new ResponseTooLargeError({ limitBytes, receivedBytes: len });
    }
  }

  if (!response.body) {
    return Buffer.alloc(0);
  }

  // Convert Web ReadableStream -> Node Readable for consistent limit handling.
  const nodeStream = Readable.fromWeb(response.body);
  const chunks: Buffer[] = [];
  let total = 0;

  try {
    for await (const chunk of nodeStream) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += buf.length;
      if (total > limitBytes) {
        try {
          nodeStream.destroy();
        } catch {
          // ignore
        }
        throw new ResponseTooLargeError({ limitBytes, receivedBytes: total });
      }
      chunks.push(buf);
    }
  } finally {
    if (total > limitBytes) {
      try {
        await response.body?.cancel();
      } catch {
        // ignore
      }
    }
  }

  return Buffer.concat(chunks, total);
}

type FetchBufferResult = { buffer: Buffer; type: string };
const ATTACH_GET_PARAMS = { timeoutMs: OneMinute / 6, maxRedirects: 3 };

export async function fetchBuffer(
  url: string,
  limit: number,
  contentType?: string
): Promise<FetchBufferResult> {
  const resp = url.startsWith('data:')
    ? await fetch(url)
    : await safeFetch(url, { method: 'GET' }, ATTACH_GET_PARAMS);

  if (!resp.ok) {
    throw new Error(
      `Failed to fetch attachment: ${resp.status} ${resp.statusText}`
    );
  }
  const type = resp.headers.get('content-type') || 'application/octet-stream';
  if (contentType && !type.startsWith(contentType)) {
    throw new Error(
      `Attachment content-type mismatch: expected ${contentType} but got ${type}`
    );
  }
  const buffer = await readResponseBufferWithLimit(resp, limit);
  return { buffer, type: type };
}

export function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
  const copy = new Uint8Array(buffer.byteLength);
  copy.set(buffer);
  return copy.buffer;
}
