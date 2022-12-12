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
  const data = await request<LoginResponse>({
    url: '/api/user/token',
    method: 'POST',
    data: params,
  });
  return data.data;
}

export interface GetUserByEmailParams {
  email: string;
}

export interface User {
  id: number;
  name: string;
  email: string;
  avatar_url: string;
  create_at: string;
}

export async function getUserByEmail(
  params: GetUserByEmailParams
): Promise<User | null> {
  const data = await request<User | null>({
    url: '/api/user',
    method: 'GET',
    data: params,
  });
  return data.data;
}
