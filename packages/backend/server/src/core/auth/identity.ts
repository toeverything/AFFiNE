export type AuthMethod =
  | 'password'
  | 'magic_link'
  | 'oauth'
  | 'open_app'
  | 'passkey';

export interface VerifiedIdentity {
  userId: string;
  method: AuthMethod;
  clientVersion?: string;
}
