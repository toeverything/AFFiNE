export const oauthFlowModes = ['popup', 'redirect'] as const;

export type OAuthFlowMode = (typeof oauthFlowModes)[number];

const OAUTH_FLOW_STORAGE_KEY = 'affine.oauth.flow';

export function resolveOAuthFlowMode(mode?: string | null): OAuthFlowMode {
  return mode === 'popup' ? 'popup' : 'redirect';
}

export function rememberOAuthFlowMode(mode: OAuthFlowMode) {
  sessionStorage.setItem(OAUTH_FLOW_STORAGE_KEY, mode);
}

export function consumeOAuthFlowMode(): OAuthFlowMode {
  const mode = resolveOAuthFlowMode(
    sessionStorage.getItem(OAUTH_FLOW_STORAGE_KEY)
  );

  sessionStorage.removeItem(OAUTH_FLOW_STORAGE_KEY);

  return mode;
}
