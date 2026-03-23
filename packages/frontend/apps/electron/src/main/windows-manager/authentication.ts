export interface AuthenticationRequest {
  method: 'magic-link' | 'oauth' | 'open-app-signin';
  payload: Record<string, any>;
  server?: string;
}
