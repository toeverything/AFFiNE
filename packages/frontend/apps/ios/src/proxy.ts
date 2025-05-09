import { openDB } from 'idb';

/**
 * the below code includes the custom fetch and xmlhttprequest implementation for ios webview.
 * should be included in the entry file of the app or webworker.
 */
const rawFetch = globalThis.fetch;
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const request = new Request(input, init);

  const origin = new URL(request.url, globalThis.location.origin).origin;

  const token = await readEndpointToken(origin);
  if (token) {
    request.headers.set('Authorization', `Bearer ${token}`);
  }

  return rawFetch(request);
};

const rawXMLHttpRequest = globalThis.XMLHttpRequest;
globalThis.XMLHttpRequest = class extends rawXMLHttpRequest {
  override send(body?: Document | XMLHttpRequestBodyInit | null): void {
    const origin = new URL(this.responseURL, globalThis.location.origin).origin;

    readEndpointToken(origin).then(
      token => {
        if (token) {
          this.setRequestHeader('Authorization', `Bearer ${token}`);
        }
        return super.send(body);
      },
      () => {
        throw new Error('Failed to read token');
      }
    );
  }
};

export async function readEndpointToken(
  endpoint: string
): Promise<string | null> {
  const idb = await openDB('affine-token', 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('tokens')) {
        db.createObjectStore('tokens', { keyPath: 'endpoint' });
      }
    },
  });

  const token = await idb.get('tokens', endpoint);
  return token ? token.token : null;
}

export async function writeEndpointToken(endpoint: string, token: string) {
  const db = await openDB('affine-token', 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('tokens')) {
        db.createObjectStore('tokens', { keyPath: 'endpoint' });
      }
    },
  });

  await db.put('tokens', { endpoint, token });
}
