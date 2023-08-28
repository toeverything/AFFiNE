import {
  getWorkspaceSharedPagesQuery,
  revokePageMutation,
  sharePageMutation,
} from '@affine/graphql';
import { useMutation, useQuery } from '@affine/workspace/affine/gql';
import { useCallback, useMemo } from 'react';

export function useIsSharedPage(
  workspaceId: string,
  pageId: string
): [isSharedPage: boolean, setSharedPage: (enable: boolean) => void] {
  const { data, mutate } = useQuery({
    query: getWorkspaceSharedPagesQuery,
    variables: {
      workspaceId,
    },
  });
  const { trigger: enableSharePage } = useMutation({
    mutation: sharePageMutation,
  });
  const { trigger: disableSharePage } = useMutation({
    mutation: revokePageMutation,
  });
  return [
    useMemo(
      () => data.workspace.sharedPages.some(id => id === pageId),
      [data.workspace.sharedPages, pageId]
    ),
    useCallback(
      (enable: boolean) => {
        // todo: push notification
        if (enable) {
          enableSharePage({
            workspaceId,
            pageId,
          })
            .then(() => {
              return mutate();
            })
            .catch(console.error);
        } else {
          disableSharePage({
            workspaceId,
            pageId,
          })
            .then(() => {
              return mutate();
            })
            .catch(console.error);
        }
        mutate().catch(console.error);
      },
      [disableSharePage, enableSharePage, mutate, pageId, workspaceId]
    ),
  ];
}
