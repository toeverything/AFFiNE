import { GithubOAuthProvider } from './github';
import { GoogleOAuthProvider } from './google';
import { OIDCProvider } from './oidc';

export const OAuthProviders = [
  GoogleOAuthProvider,
  GithubOAuthProvider,
  OIDCProvider,
];
