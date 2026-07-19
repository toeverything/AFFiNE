import { canonicalAuthEndpoint } from '@affine/mobile-shared/auth/endpoint';

import { Auth } from './plugins/auth';

function authEndpointForUrl(url: string | URL) {
  try {
    const parsed = new URL(url, globalThis.location.origin);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
      ? parsed.origin
      : null;
  } catch {
    return null;
  }
}

/**
 * the below code includes the custom fetch and xmlhttprequest implementation for ios webview.
 * should be included in the entry file of the app or webworker.
 */
const rawFetch = globalThis.fetch;
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const request = new Request(input, init);
  const retry = request.clone();

  const origin = authEndpointForUrl(request.url);

  const token = origin ? await getValidAccessToken(origin) : null;
  if (token) {
    request.headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await rawFetch(request);
  if (response.status !== 401 || !origin) return response;
  const body = await response
    .clone()
    .json()
    .catch(() => null);
  if (body?.code !== 'ACCESS_TOKEN_EXPIRED') return response;
  const { token: refreshed } = await Auth.refreshAccessToken({
    endpoint: origin,
  });
  retry.headers.set('Authorization', `Bearer ${refreshed}`);
  return rawFetch(retry);
};

const rawXMLHttpRequest = globalThis.XMLHttpRequest;
const xhrRequestUrls = new WeakMap<XMLHttpRequest, string>();
globalThis.XMLHttpRequest = class extends rawXMLHttpRequest {
  private request:
    | {
        method: string;
        url: string | URL;
        async: boolean;
        username?: string | null;
        password?: string | null;
      }
    | undefined;
  private readonly headers = new Map<string, string>();
  private requestBody?: Document | XMLHttpRequestBodyInit | null;
  private replaying = false;
  private hasReplayed = false;

  constructor() {
    super();
    const suppressExpiredResponse = (event: Event) => {
      if (this.replaying) event.stopImmediatePropagation();
    };
    this.addEventListener('load', suppressExpiredResponse, true);
    this.addEventListener('loadend', suppressExpiredResponse, true);
    this.addEventListener(
      'readystatechange',
      event => {
        if (
          this.readyState !== rawXMLHttpRequest.DONE ||
          this.status !== 401 ||
          this.replaying ||
          this.hasReplayed ||
          !this.request?.async
        ) {
          return;
        }
        let code: unknown;
        try {
          code =
            this.responseType === 'json'
              ? this.response?.code
              : JSON.parse(this.responseText)?.code;
        } catch {
          return;
        }
        if (code !== 'ACCESS_TOKEN_EXPIRED') return;
        event.stopImmediatePropagation();
        this.replaying = true;
        this.hasReplayed = true;
        this.replayWithFreshToken().catch(() => {});
      },
      true
    );
  }

  override open(
    method: string,
    url: string | URL,
    async: boolean = true,
    username?: string | null,
    password?: string | null
  ): void {
    this.request = { method, url, async, username, password };
    this.headers.clear();
    this.requestBody = undefined;
    this.replaying = false;
    this.hasReplayed = false;
    xhrRequestUrls.set(this, url.toString());
    return super.open(
      method,
      url,
      async,
      username ?? undefined,
      password ?? undefined
    );
  }

  override setRequestHeader(name: string, value: string): void {
    this.headers.set(name, value);
    super.setRequestHeader(name, value);
  }

  override send(body?: Document | XMLHttpRequestBodyInit | null): void {
    this.requestBody = body;
    const requestUrl = xhrRequestUrls.get(this);
    const origin = authEndpointForUrl(requestUrl ?? globalThis.location.href);

    (origin ? getValidAccessToken(origin) : Promise.resolve(null))
      .then(token => {
        if (token) {
          super.setRequestHeader('Authorization', `Bearer ${token}`);
        }
        return super.send(body);
      })
      .catch(() => {
        this.dispatchEvent(new Event('error'));
        this.dispatchEvent(new Event('loadend'));
      });
  }

  private async replayWithFreshToken() {
    const request = this.request;
    if (!request) return this.failReplay();
    const origin = authEndpointForUrl(request.url);
    if (!origin) return this.failReplay();
    try {
      const { token } = await Auth.refreshAccessToken({ endpoint: origin });
      const responseType = this.responseType;
      const timeout = this.timeout;
      const withCredentials = this.withCredentials;
      super.open(
        request.method,
        request.url,
        true,
        request.username ?? undefined,
        request.password ?? undefined
      );
      this.replaying = false;
      this.headers.forEach((value, name) => {
        if (name.toLowerCase() !== 'authorization') {
          super.setRequestHeader(name, value);
        }
      });
      super.setRequestHeader('Authorization', `Bearer ${token}`);
      this.responseType = responseType;
      this.timeout = timeout;
      this.withCredentials = withCredentials;
      super.send(this.requestBody);
    } catch {
      this.failReplay();
    }
  }

  private failReplay() {
    this.replaying = false;
    this.dispatchEvent(new Event('readystatechange'));
    this.dispatchEvent(new Event('error'));
    this.dispatchEvent(new Event('loadend'));
  }
};

export async function getValidAccessToken(
  endpoint: string
): Promise<string | null> {
  const { token } = await Auth.getValidAccessToken({
    endpoint: canonicalAuthEndpoint(endpoint),
  });
  return token ?? null;
}

export async function clearEndpointSession(endpoint: string) {
  await Auth.clearEndpointSession({
    endpoint: canonicalAuthEndpoint(endpoint),
  });
}
