import { type DropTargetDropEvent, useDropTarget } from '@affine/component';
import type { AffineDNDData } from '@affine/core/types/dnd';
import { useI18n } from '@affine/i18n';

import * as styles from './empty.css';

export const Empty = ({
  onDrop,
}: {
  onDrop: (data: DropTargetDropEvent<AffineDNDData>) => void;
}) => {
  const { dropTargetRef } = useDropTarget(
    () => ({
      onDrop,
    }),
    [onDrop]
  );
  const t = useI18n();
  return (
    <div className={styles.noReferences} ref={dropTargetRef}>
      {t['com.affine.rootAppSidebar.docs.no-subdoc']()}
    </div>
  );
};
