import { UserFriendlyError } from '@affine/error';
import { gqlFetcherFactory } from '@affine/graphql';

import { DummyConnection } from '../../connection';

export class HttpConnection extends DummyConnection {
  readonly fetch = async (
    input: string,
    init?: RequestInit & { timeout?: number }
  ) => {
    const externalSignal = init?.signal;
    if (externalSignal?.aborted) {
      throw externalSignal.reason;
    }

    const abortController = new AbortController();
    externalSignal?.addEventListener('abort', reason => {
      abortController.abort(reason);
    });

    const timeout = init?.timeout ?? 15000;
    const timeoutId =
      timeout > 0
        ? setTimeout(() => {
            abortController.abort(new Error('request timeout'));
          }, timeout)
        : undefined;

    const res = await globalThis
      .fetch(new URL(input, this.serverBaseUrl), {
        ...init,
        signal: abortController.signal,
        headers: {
          ...this.requestHeaders,
          ...init?.headers,
          'x-affine-version': BUILD_CONFIG.appVersion,
        },
      })
      .catch(err => {
        throw new UserFriendlyError({
          status: 504,
          code: 'NETWORK_ERROR',
          type: 'NETWORK_ERROR',
          name: 'NETWORK_ERROR',
          message: `Network error: ${err.message}`,
          stacktrace: err.stack,
        });
      });
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    if (!res.ok && res.status !== 404) {
      if (res.status === 413) {
        throw new UserFriendlyError({
          status: 413,
          code: 'CONTENT_TOO_LARGE',
          type: 'CONTENT_TOO_LARGE',
          name: 'CONTENT_TOO_LARGE',
          message: 'Content too large',
        });
      } else if (
        res.headers.get('Content-Type')?.startsWith('application/json')
      ) {
        throw UserFriendlyError.fromAny(await res.json());
      } else {
        throw UserFriendlyError.fromAny(await res.text());
      }
    }
    return res;
  };

  readonly fetchArrayBuffer = async (input: string, init?: RequestInit) => {
    const res = await this.fetch(input, init);
    if (res.status === 404) {
      // 404
      return null;
    }
    try {
      return await res.arrayBuffer();
    } catch (err) {
      throw new Error('fetch download error: ' + err);
    }
  };

  readonly gql = gqlFetcherFactory(
    new URL('/graphql', this.serverBaseUrl).href,
    this.fetch
  );

  constructor(
    private readonly serverBaseUrl: string,
    private readonly requestHeaders?: Record<string, string>
  ) {
    super();
  }
}
