import { appSchemes, channelToScheme } from '@affine/core/utils/channel';
import { DebugLogger } from '@affine/debug';

const logger = new DebugLogger('open-in-app');

export type AuthenticationMethod = 'magic-link' | 'oauth' | 'open-app-signin';

export function buildAuthenticationDeepLink(options: {
  scheme: string;
  method: AuthenticationMethod;
  payload: unknown;
  server?: string;
}) {
  const params = new URLSearchParams();
  params.set('method', options.method);
  params.set('payload', JSON.stringify(options.payload));
  if (options.server) {
    params.set('server', options.server);
  }

  return `${options.scheme}://authentication?${params.toString()}`;
}

export function buildOpenAppUrlRoute(urlToOpen: string) {
  const params = new URLSearchParams();
  params.set('url', urlToOpen);
  return `/open-app/url?${params.toString()}`;
}

function isAllowedOpenAppSignInNext(next: string) {
  if (next === '/') {
    return true;
  }

  if (next.startsWith('/workspace')) {
    const boundary = next.charAt('/workspace'.length);
    return (
      boundary === '' ||
      boundary === '/' ||
      boundary === '?' ||
      boundary === '#'
    );
  }

  return next.startsWith('/share/');
}

export function normalizeOpenAppSignInNextParam(
  next: string | null,
  currentOrigin: string
) {
  if (!next) {
    return;
  }

  // Disallow protocol-relative urls like `//evil.example`.
  if (next.startsWith('//')) {
    return;
  }

  let parsed: URL;
  try {
    parsed = new URL(next, currentOrigin);
  } catch {
    return;
  }

  // Only allow navigation within current origin.
  if (parsed.origin !== currentOrigin) {
    return;
  }

  const normalized = `${parsed.pathname}${parsed.search}${parsed.hash}`;

  if (!isAllowedOpenAppSignInNext(normalized)) {
    return;
  }

  return normalized;
}

// return an AFFiNE app's url to be opened in desktop app
export const getOpenUrlInDesktopAppLink = (
  url: string,
  newTab = true,
  scheme = channelToScheme[BUILD_CONFIG.appBuildType]
) => {
  try {
    if (!scheme) {
      return null;
    }

    const urlObject = new URL(url, location.origin);
    const params = urlObject.searchParams;

    if (newTab) {
      params.set('new-tab', '1');
    }
    if (environment.isSelfHosted) {
      // assume self-hosted server is the current origin
      params.set('server', location.origin);
    }
    return new URL(
      `${scheme}://${urlObject.host}${urlObject.pathname}?${params.toString()}#${urlObject.hash}`
    ).toString();
  } catch (e) {
    logger.error('Failed to get open url in desktop app link', e);
    return null;
  }
};

// params only meaningful to the desktop app's window manager
const desktopOnlyDeepLinkParams = ['new-tab', 'hidden'];

// the inverse of `getOpenUrlInDesktopAppLink`:
// resolve an `affine://<host>/workspace/...` deep link into an in-app route
export const resolveDeepLinkRoute = (url: string) => {
  const schemeEnd = url.indexOf('://');
  if (
    schemeEnd <= 0 ||
    !appSchemes.safeParse(url.slice(0, schemeEnd)).success
  ) {
    return;
  }

  let urlObject: URL;
  try {
    // parse as a special url so that host and path are split the same way
    // regardless of the runtime's support for custom schemes
    urlObject = new URL(`https${url.slice(schemeEnd)}`);
  } catch {
    return;
  }

  if (urlObject.hostname === 'authentication') {
    return;
  }

  for (const param of desktopOnlyDeepLinkParams) {
    urlObject.searchParams.delete(param);
  }

  const route = `${urlObject.pathname}${urlObject.search}${urlObject.hash}`;
  if (route === '/' || !isAllowedOpenAppSignInNext(route)) {
    return;
  }

  return route;
};
