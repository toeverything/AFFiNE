import useSWR from 'swr';

import { QueryKey } from '../../plugins/affine/fetcher';

export interface QueryEmailMember {
  id: string;
  name: string;
  email: string;
  avatar_url: string;
  create_at: string;
}

export function useUsersByEmail(
  workspaceId: string,
  email: string
): QueryEmailMember[] | null {
  const { data } = useSWR<QueryEmailMember[] | null>(
    [QueryKey.getUserByEmail, workspaceId, email],
    {
      fallbackData: null,
    }
  );
  return data ?? null;
}
