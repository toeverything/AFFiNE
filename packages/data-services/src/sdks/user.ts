import { client } from '../request';

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
  const searchParams = new URLSearchParams({ ...params });
  return client.get('/api/user', { searchParams }).json<User | null>();
}
