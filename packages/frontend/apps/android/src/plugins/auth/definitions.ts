export interface AuthPlugin {
  signInMagicLink(options: {
    endpoint: string;
    email: string;
    token: string;
    clientNonce?: string;
  }): Promise<{ token: string }>;
  signInOauth(options: {
    endpoint: string;
    code: string;
    state: string;
    clientNonce?: string;
  }): Promise<{ token: string }>;
  signInPassword(options: {
    endpoint: string;
    email: string;
    password: string;
    verifyToken?: string;
    challenge?: string;
  }): Promise<{ token: string }>;
  signInOpenApp(options: {
    endpoint: string;
    code: string;
  }): Promise<{ token: string }>;
  signOut(options: { endpoint: string; token?: string | null }): Promise<void>;
  readEndpointToken(options: {
    endpoint: string;
  }): Promise<{ token?: string | null }>;
  writeEndpointToken(options: {
    endpoint: string;
    token: string;
  }): Promise<void>;
  deleteEndpointToken(options: { endpoint: string }): Promise<void>;
}
