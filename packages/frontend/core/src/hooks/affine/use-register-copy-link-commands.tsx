import { registerAffineCommand } from '@affine/core/commands';
import { useSharingUrl } from '@affine/core/hooks/affine/use-share-url';
import { useEffect } from 'react';

export function useRegisterCopyLinkCommands({
  workspaceId,
  docId,
  isActiveView,
}: {
  workspaceId: string;
  docId: string;
  isActiveView: boolean;
}) {
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
        preconditionStrategy: () => isActiveView,
        keyBinding: {
          binding: '$mod+Shift+c',
        },
        label: '',
        icon: null,
        run() {
          isActiveView && onClickCopyLink();
        },
      })
    );
    return () => {
      unsubs.forEach(unsub => unsub());
    };
  }, [docId, isActiveView, onClickCopyLink]);
}
