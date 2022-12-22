import { request } from '../request';

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
