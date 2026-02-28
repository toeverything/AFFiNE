import { OAuthProviderName } from './config';

export interface OAuthPkceState {
  codeVerifier: string;
  codeChallengeMethod: 'S256';
}

export interface OAuthPkceChallenge extends OAuthPkceState {
  codeChallenge: string;
}

export interface OAuthState {
  redirectUri?: string;
  client?: string;
  clientNonce?: string;
  provider: OAuthProviderName;
  pkce?: OAuthPkceState;
  token?: string;
}
