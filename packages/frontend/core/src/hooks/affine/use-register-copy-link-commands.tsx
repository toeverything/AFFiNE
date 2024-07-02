import {
  PreconditionStrategy,
  registerAffineCommand,
} from '@affine/core/commands';
import { useSharingUrl } from '@affine/core/hooks/affine/use-share-url';
import { useIsActiveView } from '@affine/core/modules/workbench';
import { WorkspaceFlavour } from '@affine/env/workspace';
import type { WorkspaceMetadata } from '@toeverything/infra';
import { useEffect } from 'react';

export function useRegisterCopyLinkCommands({
  workspaceMeta,
  docId,
}: {
  workspaceMeta: WorkspaceMetadata;
  docId: string;
}) {
  const isActiveView = useIsActiveView();
  const workspaceId = workspaceMeta.id;
  const isCloud = workspaceMeta.flavour === WorkspaceFlavour.AFFINE_CLOUD;
  const { onClickCopyLink } = useSharingUrl({
    workspaceId,
    pageId: docId,
    urlType: 'workspace',
  });

  useEffect(() => {
    const unsubs: Array<() => void> = [];

    unsubs.push(
      registerAffineCommand({
        id: `affine:share-private-link:${docId}`,
        category: 'affine:general',
        preconditionStrategy: PreconditionStrategy.Never,
        keyBinding: {
          binding: '$mod+Shift+c',
        },
        label: '',
        icon: null,
        run() {
          isActiveView && isCloud && onClickCopyLink();
        },
      })
    );
    return () => {
      unsubs.forEach(unsub => unsub());
    };
  }, [docId, isActiveView, isCloud, onClickCopyLink]);
}
