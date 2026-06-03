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

function canonicalEndpoint(endpoint: string) {
  return authEndpointForUrl(endpoint) ?? endpoint;
}

/**
 * the below code includes the custom fetch and xmlhttprequest implementation for ios webview.
 * should be included in the entry file of the app or webworker.
 */
const rawFetch = globalThis.fetch;
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const request = new Request(input, init);

  const origin = authEndpointForUrl(request.url);

  const token = origin
    ? await readEndpointToken(origin).catch(() => null)
    : null;
  if (token) {
    request.headers.set('Authorization', `Bearer ${token}`);
  }

  return rawFetch(request);
};

const rawXMLHttpRequest = globalThis.XMLHttpRequest;
const xhrRequestUrls = new WeakMap<XMLHttpRequest, string>();
globalThis.XMLHttpRequest = class extends rawXMLHttpRequest {
  override open(
    method: string,
    url: string | URL,
    async: boolean = true,
    username?: string | null,
    password?: string | null
  ): void {
    xhrRequestUrls.set(this, url.toString());
    return super.open(
      method,
      url,
      async,
      username ?? undefined,
      password ?? undefined
    );
  }

  override send(body?: Document | XMLHttpRequestBodyInit | null): void {
    const requestUrl = xhrRequestUrls.get(this);
    const origin = authEndpointForUrl(requestUrl ?? globalThis.location.href);

    (origin ? readEndpointToken(origin) : Promise.resolve(null)).then(
      token => {
        if (token) {
          this.setRequestHeader('Authorization', `Bearer ${token}`);
        }
        return super.send(body);
      },
      () => {
        return super.send(body);
      }
    );
  }
};

export async function readEndpointToken(
  endpoint: string
): Promise<string | null> {
  const { token } = await Auth.readEndpointToken({
    endpoint: canonicalEndpoint(endpoint),
  });
  return token ?? null;
}

export async function writeEndpointToken(endpoint: string, token: string) {
  await Auth.writeEndpointToken({
    endpoint: canonicalEndpoint(endpoint),
    token,
  });
}

export async function deleteEndpointToken(endpoint: string) {
  await Auth.deleteEndpointToken({ endpoint: canonicalEndpoint(endpoint) });
}
