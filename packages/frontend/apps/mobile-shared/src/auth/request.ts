import { shouldRefreshAccessToken } from './endpoint';

export interface AuthRequestProvider {
  getValidAccessToken(endpoint: string): Promise<string | null>;
  refreshAccessToken(endpoint: string): Promise<string>;
}

function authEndpointForUrl(url: string | URL) {
  try {
    const parsed = new URL(
      url,
      globalThis.location?.origin ?? 'http://localhost'
    );
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
      ? parsed.origin
      : null;
  } catch {
    return null;
  }
}

export function createAuthFetch(
  provider: AuthRequestProvider,
  rawFetch: typeof globalThis.fetch
) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const retry = request.clone();
    const endpoint = authEndpointForUrl(request.url);
    const token = endpoint
      ? await provider.getValidAccessToken(endpoint)
      : null;

    if (token) {
      request.headers.set('Authorization', `Bearer ${token}`);
    }

    const response = await rawFetch(request);
    if (response.status !== 401 || !endpoint) return response;

    const body = await response
      .clone()
      .json()
      .catch(() => null);
    if (!shouldRefreshAccessToken(body?.code)) return response;

    const refreshed = await provider.refreshAccessToken(endpoint);
    retry.headers.set('Authorization', `Bearer ${refreshed}`);
    return rawFetch(retry);
  };
}

export function installAuthRequestProxy(provider: AuthRequestProvider) {
  const rawFetch = globalThis.fetch;
  globalThis.fetch = createAuthFetch(provider, rawFetch);

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
    private sendVersion = 0;

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
          if (!shouldRefreshAccessToken(code)) return;
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
      this.sendVersion++;
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
      const endpoint = authEndpointForUrl(
        requestUrl ?? globalThis.location.href
      );
      const sendVersion = this.sendVersion;

      const sendWithToken = (token: string | null) => {
        if (sendVersion !== this.sendVersion) return;
        if (token) {
          super.setRequestHeader('Authorization', `Bearer ${token}`);
        }
        super.send(body);
      };

      (endpoint
        ? provider.getValidAccessToken(endpoint)
        : Promise.resolve(null)
      ).then(sendWithToken, () => sendWithToken(null));
    }

    override abort(): void {
      this.sendVersion++;
      this.replaying = false;
      super.abort();
    }

    private async replayWithFreshToken() {
      const request = this.request;
      if (!request) return this.failReplay();
      const endpoint = authEndpointForUrl(request.url);
      if (!endpoint) return this.failReplay();
      const sendVersion = this.sendVersion;
      try {
        const token = await provider.refreshAccessToken(endpoint);
        if (sendVersion !== this.sendVersion) return;
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
        if (sendVersion === this.sendVersion) {
          this.failReplay();
        }
      }
    }

    private failReplay() {
      this.replaying = false;
      this.dispatchEvent(new Event('readystatechange'));
      this.dispatchEvent(new Event('error'));
      this.dispatchEvent(new Event('loadend'));
    }
  };
}
