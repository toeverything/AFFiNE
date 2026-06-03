import { createIdentifier } from '@toeverything/infra';

export interface SignInUserInfo {
  id: string;
  email: string;
  name: string;
  hasPassword: boolean | null;
  avatarUrl: string | null;
  emailVerified: boolean;
}

export interface AuthProvider {
  signInMagicLink(
    email: string,
    token: string,
    clientNonce?: string
  ): Promise<void>;

  signInOauth(
    code: string,
    state: string,
    provider: string,
    clientNonce?: string
  ): Promise<{ redirectUri?: string }>;

  signInPassword(credential: {
    email: string;
    password: string;
    verifyToken?: string;
    challenge?: string;
  }): Promise<SignInUserInfo | void>;

  signInOpenAppSignInCode(code: string): Promise<void>;

  signOut(): Promise<void>;
}

export const AuthProvider = createIdentifier<AuthProvider>('AuthProvider');
