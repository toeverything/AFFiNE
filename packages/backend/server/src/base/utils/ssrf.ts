import {
  assertSafeUrl as assertSafeUrlFromNative,
  safeFetch as safeFetchFromNative,
  type SafeFetchRequest,
} from '../../native';
import { ResponseTooLargeError, SsrfBlockedError } from '../error/errors.gen';

export type SSRFBlockReason =
  | 'invalid_url'
  | 'disallowed_protocol'
  | 'url_has_credentials'
  | 'blocked_hostname'
  | 'unresolvable_hostname'
  | 'blocked_ip'
  | 'too_many_redirects';

const SSRF_REASONS = new Set<string>([
  'invalid_url',
  'disallowed_protocol',
  'url_has_credentials',
  'blocked_hostname',
  'unresolvable_hostname',
  'blocked_ip',
  'too_many_redirects',
]);

function createSsrfBlockedError(reason: SSRFBlockReason) {
  return new SsrfBlockedError({ reason });
}

function mapNativeFetchError(error: unknown, limitBytes?: number) {
  const message = error instanceof Error ? error.message : String(error);
  const reason = [...SSRF_REASONS].find(reason => message.includes(reason));
  if (reason) {
    return createSsrfBlockedError(reason as SSRFBlockReason);
  }
  if (message.includes('response_too_large')) {
    return new ResponseTooLargeError({
      limitBytes: limitBytes ?? 0,
      receivedBytes: limitBytes ? limitBytes + 1 : 0,
    });
  }
  return error;
}

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxRedirects?: number;
  maxBytes?: number;
}

export async function assertSsrFSafeUrl(rawUrl: string | URL): Promise<URL> {
  let url: URL;
  try {
    url = rawUrl instanceof URL ? rawUrl : new URL(rawUrl);
  } catch {
    throw createSsrfBlockedError('invalid_url');
  }

  try {
    assertSafeUrlFromNative({ url: url.toString() });
    return url;
  } catch (error) {
    throw mapNativeFetchError(error);
  }
}

export async function safeFetch(
  rawUrl: string | URL,
  init: RequestInit = {},
  options: SafeFetchOptions = {}
): Promise<Response> {
  const url = rawUrl.toString();
  const method = String(init.method ?? 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    throw new Error(`Unsupported safeFetch method: ${method}`);
  }

  try {
    const response = await safeFetchFromNative({
      url,
      method: (method === 'HEAD' ? 'head' : 'get') as NonNullable<
        SafeFetchRequest['method']
      >,
      headers: normalizeHeaders(init.headers),
      timeoutMs: options.timeoutMs,
      maxRedirects: options.maxRedirects,
      maxBytes: options.maxBytes,
    });
    const body =
      method === 'HEAD' || [204, 205, 304].includes(response.status)
        ? null
        : response.body;
    const webResponse = new Response(body, {
      status: response.status,
      headers: response.headers,
    });
    Object.defineProperty(webResponse, 'url', {
      value: response.finalUrl,
    });
    return webResponse;
  } catch (error) {
    throw mapNativeFetchError(error, options.maxBytes);
  }
}

function normalizeHeaders(headers: RequestInit['headers'] | undefined) {
  if (!headers) return undefined;
  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key, String(value)])
  );
}

export function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer {
  const copy = new Uint8Array(buffer.byteLength);
  copy.set(buffer);
  return copy.buffer;
}
