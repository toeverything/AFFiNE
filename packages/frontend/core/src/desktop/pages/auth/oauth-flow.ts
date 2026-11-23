export const oauthFlowModes = ['popup', 'redirect'] as const;

export type OAuthFlowMode = (typeof oauthFlowModes)[number];

export function resolveOAuthFlowMode(
  mode?: string | null,
  fallback: OAuthFlowMode = 'redirect'
): OAuthFlowMode {
  return mode === 'popup' || mode === 'redirect' ? mode : fallback;
}

export function attachOAuthFlowToAuthUrl(url: string, flow: OAuthFlowMode) {
  const authUrl = new URL(url);
  const state = authUrl.searchParams.get('state');
  if (!state) return url;

  try {
    const payload = JSON.parse(state) as Record<string, unknown>;
    authUrl.searchParams.set('state', JSON.stringify({ ...payload, flow }));
    return authUrl.toString();
  } catch {
    return url;
  }
}

export function readOAuthFlowModeFromCallbackState(state: string | null) {
  if (!state) return 'popup';

  try {
    const payload = JSON.parse(state) as { flow?: string };
    return resolveOAuthFlowMode(payload.flow, 'popup');
  } catch {
    return 'popup';
  }
}

export function parseOAuthCallbackState(state: string) {
  const parsed = JSON.parse(state) as {
    client?: string;
    provider?: string;
    state?: string;
  };

  return {
    client: parsed.client,
    flow: readOAuthFlowModeFromCallbackState(state),
    provider: parsed.provider,
    state: parsed.state,
  };
}

export function resolveOAuthRedirect(
  redirectUri: string | null | undefined,
  currentOrigin: string
) {
  if (!redirectUri) return '/';
  if (redirectUri.startsWith('/') && !redirectUri.startsWith('//')) {
    return redirectUri;
  }

  let target: URL;
  try {
    target = new URL(redirectUri);
  } catch {
    return '/';
  }

  if (target.origin === currentOrigin) return target.toString();

  const redirectProxy = new URL('/redirect-proxy', currentOrigin);
  redirectProxy.searchParams.set('redirect_uri', target.toString());
  return redirectProxy.toString();
}
