import {
  getWorkspacePublicByIdQuery,
  setWorkspacePublicByIdMutation,
} from '@affine/graphql';
import { useMutation } from '@affine/workspace/affine/gql';
import { useCallback } from 'react';
import { useSWRConfig } from 'swr';

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
          return key[0] === getWorkspacePublicByIdQuery;
        }
        return false;
      });
    },
    [mutate, trigger, workspaceId]
  );
}
