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
  const { data } = useQuery({
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
          }).catch(e => {
            console.error(e);
          });
        } else {
          disableSharePage({
            workspaceId,
            pageId,
          }).catch(e => {
            console.error(e);
          });
        }
      },
      [disableSharePage, enableSharePage, pageId, workspaceId]
    ),
  ];
}
