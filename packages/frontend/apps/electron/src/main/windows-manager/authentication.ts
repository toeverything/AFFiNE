export interface AuthenticationRequest {
  method: 'magic-link' | 'oauth';
  payload: Record<string, any>;
  server?: string;
}
