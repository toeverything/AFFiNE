import { type DropTargetDropEvent, useDropTarget } from '@affine/component';
import type { AffineDNDData } from '@affine/core/types/dnd';
import { useI18n } from '@affine/i18n';

import { EmptyNodeChildren } from '../../layouts/empty-node-children';

export const Empty = ({
  onDrop,
  noAccessible = false,
}: {
  onDrop: (data: DropTargetDropEvent<AffineDNDData>) => void;
  noAccessible?: boolean;
}) => {
  const { dropTargetRef } = useDropTarget<AffineDNDData>(
    () => ({
      onDrop,
    }),
    [onDrop]
  );
  const t = useI18n();

  return (
    <EmptyNodeChildren ref={dropTargetRef}>
      {noAccessible
        ? t['com.affine.share-menu.option.permission.no-access']()
        : t['com.affine.rootAppSidebar.docs.no-subdoc']()}
    </EmptyNodeChildren>
  );
};
