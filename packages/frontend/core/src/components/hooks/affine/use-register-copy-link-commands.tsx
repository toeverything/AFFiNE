import {
  PreconditionStrategy,
  registerAffineCommand,
} from '@affine/core/commands';
import { useSharingUrl } from '@affine/core/components/hooks/affine/use-share-url';
import { getDefaultShareMode } from '@affine/core/components/hooks/affine/use-share-url.utils';
import { EditorService } from '@affine/core/modules/editor';
import { useIsActiveView } from '@affine/core/modules/workbench';
import type { WorkspaceMetadata } from '@affine/core/modules/workspace';
import { track } from '@affine/track';
import { useLiveData, useService } from '@toeverything/infra';
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
  const isCloud = workspaceMeta.flavour !== 'local';
  const currentMode = useLiveData(useService(EditorService).editor.mode$);

  const { onClickCopyLink } = useSharingUrl({
    workspaceId,
    pageId: docId,
  });

  useEffect(() => {
    if (!isActiveView) {
      return;
    }
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
          track.$.cmdk.general.copyShareLink();
          isActiveView &&
            isCloud &&
            onClickCopyLink(getDefaultShareMode(currentMode));
        },
      })
    );
    return () => {
      unsubs.forEach(unsub => unsub());
    };
  }, [currentMode, docId, isActiveView, isCloud, onClickCopyLink]);
}
