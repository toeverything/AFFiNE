import { setWorkspacePublicByIdMutation } from '@affine/graphql';
import { useCallback } from 'react';

import { useMutation } from '../use-mutation';
import { useMutateCloud } from './use-mutate-cloud';

export function useToggleCloudPublic(workspaceId: string) {
  const mutate = useMutateCloud();
  const { trigger } = useMutation({
    mutation: setWorkspacePublicByIdMutation,
  });
  return useCallback(
    async (isPublic: boolean) => {
      await trigger({
        id: workspaceId,
        public: isPublic,
      });
      await mutate();
    },
    [mutate, trigger, workspaceId]
  );
}
