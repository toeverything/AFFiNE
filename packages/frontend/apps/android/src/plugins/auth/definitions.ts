export interface AuthPlugin {
  signInMagicLink(options: {
    endpoint: string;
    email: string;
    token: string;
    clientNonce?: string;
  }): Promise<void>;
  signInOauth(options: {
    endpoint: string;
    code: string;
    state: string;
    clientNonce?: string;
  }): Promise<void>;
  signInPassword(options: {
    endpoint: string;
    email: string;
    password: string;
    verifyToken?: string;
    challenge?: string;
  }): Promise<void>;
  signInOpenApp(options: { endpoint: string; code: string }): Promise<void>;
  signOut(options: { endpoint: string }): Promise<void>;
  getValidAccessToken(options: {
    endpoint: string;
  }): Promise<{ token?: string | null }>;
  refreshAccessToken(options: { endpoint: string }): Promise<{ token: string }>;
  clearEndpointSession(options: { endpoint: string }): Promise<void>;
}
