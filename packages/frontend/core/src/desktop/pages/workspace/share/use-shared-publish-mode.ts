import { ServerService } from '@affine/core/modules/cloud';
import { getWorkspacePageByIdQuery } from '@affine/graphql';
import { type DocMode } from '@blocksuite/affine/model';
import { useService } from '@toeverything/infra';
import { useEffect, useState } from 'react';

import { getResolvedPublishMode } from './share-page.utils';

export const useSharedPublishMode = ({
  docId,
  publishMode,
  workspaceId,
}: {
  docId: string;
  publishMode?: DocMode;
  workspaceId: string;
}) => {
  const serverService = useService(ServerService);
  const [resolvedPublishMode, setResolvedPublishMode] = useState<DocMode | null>(
    publishMode ?? null
  );

  useEffect(() => {
    const controller = new AbortController();

    if (publishMode) {
      setResolvedPublishMode(publishMode);

      return () => {
        controller.abort();
      };
    }

    setResolvedPublishMode(null);

    serverService.server
      .gql({
        query: getWorkspacePageByIdQuery,
        variables: {
          workspaceId,
          pageId: docId,
        },
        context: {
          signal: controller.signal,
        },
      })
      .then(data => {
        const publicMode = data.workspace.doc?.mode;
        setResolvedPublishMode(getResolvedPublishMode(null, publicMode));
      })
      .catch(err => {
        if (controller.signal.aborted) {
          return;
        }

        console.error(err);
        setResolvedPublishMode('page');
      });

    return () => {
      controller.abort();
    };
  }, [docId, publishMode, serverService.server, workspaceId]);

  return resolvedPublishMode;
};
