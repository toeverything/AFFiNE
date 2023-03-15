import type { KyInstance } from 'ky/distribution/types/ky';

export interface GetUserByEmailParams {
  email: string;
  workspace_id: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatar_url: string;
  create_at: string;
}

export function createUserApis(bareClient: KyInstance, authClient: KyInstance) {
  return {
    getUserByEmail: async (
      params: GetUserByEmailParams
    ): Promise<User[] | null> => {
      const searchParams = new URLSearchParams({ ...params });
      return authClient.get('api/user', { searchParams }).json<User[] | null>();
    },
  } as const;
}
