import { request } from '../request';

export interface ExchangeToken {
  type: 'Google';
  /**
   * Token from firebase.
   */
  token: string;
}

export interface RefreshToken {
  type: 'Refresh';
  token: string;
}

export type LoginParams = ExchangeToken | RefreshToken;

export interface LoginResponse {
  /**
   * JWT, expires in a very short time
   */
  token: string;
  /**
   * Refresh token
   */
  refresh: string;
}

export async function login(params: LoginParams): Promise<LoginResponse> {
  return request
    .post('/api/user/token', { json: params, headers: { token: undefined } })
    .json<LoginResponse>();
}

export interface GetUserByEmailParams {
  email: string;
  workspaceId: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatar_url: string;
  create_at: string;
}

export async function getUserByEmail(
  params: GetUserByEmailParams
): Promise<User | null> {
  return request.get('/api/user', { json: params }).json<User | null>();
}
