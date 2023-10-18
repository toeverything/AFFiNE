export interface FetchOptions {
  fetch?: typeof fetch;
  signal?: AbortSignal;

  normalizeURL?(url: string): string;

  /**
   * Virtualize a url
   * @param url URL to be rewrite
   * @param direction Direction of this rewrite.
   * 'in' means the url is from the outside world and should be virtualized.
   * 'out' means the url is from the inside world and should be de-virtualized to fetch the real target.
   */
  rewriteURL?(url: string, direction: 'in' | 'out'): string;

  replaceRequest?(request: Request): Request | PromiseLike<Request>;

  replaceResponse?(response: Response): Response | PromiseLike<Response>;

  canConnect?(url: string): boolean | PromiseLike<boolean>;
}

export function createFetch(options: FetchOptions) {
  const {
    fetch: _fetch = fetch,
    signal,
    rewriteURL,
    replaceRequest,
    replaceResponse,
    canConnect,
    normalizeURL,
  } = options;

  return async function fetch(input: RequestInfo, init?: RequestInit) {
    let request = new Request(input, {
      ...init,
      signal: getMergedSignal(init?.signal, signal) || null,
    });

    if (normalizeURL) request = new Request(normalizeURL(request.url), request);
    if (canConnect && !(await canConnect(request.url)))
      throw new TypeError('Failed to fetch');
    if (rewriteURL)
      request = new Request(rewriteURL(request.url, 'out'), request);
    if (replaceRequest) request = await replaceRequest(request);

    let response = await _fetch(request);

    if (rewriteURL) {
      const { url, redirected, type } = response;
      // Note: Response constructor does not allow us to set the url of a response.
      //       we have to define the own property on it. This is not a good simulation.
      //       To prevent get the original url by Response.prototype.[[get url]].call(response)
      //       we copy a response and set it's url to empty.
      response = new Response(response.body, response);
      Object.defineProperties(response, {
        url: { value: url, configurable: true },
        redirected: { value: redirected, configurable: true },
        type: { value: type, configurable: true },
      });
      Object.defineProperty(response, 'url', {
        configurable: true,
        value: rewriteURL(url, 'in'),
      });
    }
    if (replaceResponse) response = await replaceResponse(response);
    return response;
  };
}

function getMergedSignal(
  signal: AbortSignal | undefined | null,
  signal2: AbortSignal | undefined | null
) {
  if (!signal) return signal2;
  if (!signal2) return signal;

  const abortController = new AbortController();
  signal.addEventListener('abort', () => abortController.abort(), {
    once: true,
  });
  signal2.addEventListener('abort', () => abortController.abort(), {
    once: true,
  });
  return abortController.signal;
}
