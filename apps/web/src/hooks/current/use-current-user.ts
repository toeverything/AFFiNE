import { AccessTokenMessage } from '@affine/datacenter';
import useSWR from 'swr';

import { QueryKey } from '../../plugins/affine/fetcher';

export function useCurrentUser(): AccessTokenMessage | null {
  const { data } = useSWR<AccessTokenMessage | null>(QueryKey.getUser, {
    fallbackData: null,
  });
  return data ?? null;
}
