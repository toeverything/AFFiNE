import {
  setWorkspacePublicByIdMutation,
} from '@affine/graphql';
import { useCallback } from 'react';
import { useSWRConfig } from 'swr';

import { useMutation } from '../../shared/gql';

export function useToggleCloudPublic(workspaceId: string) {
  const { mutate } = useSWRConfig();
  const { trigger } = useMutation({
    mutation: setWorkspacePublicByIdMutation,
  });
  return useCallback(
    async (isPublic: boolean) => {
      await trigger({
        id: workspaceId,
        public: isPublic,
      });
      await mutate(key => {
        if (Array.isArray(key)) {
          return key[0] === 'cloud';
        }
        return false;
      });
    },
    [mutate, trigger, workspaceId]
  );
}
