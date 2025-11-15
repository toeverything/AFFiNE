import type { useDropTarget } from '@affine/component';
import { useI18n } from '@affine/i18n';
import { CopyIcon, LinkIcon, MoveToIcon } from '@blocksuite/icons/rc';
import { createPortal } from 'react-dom';

import * as styles from './drop-effect.css';

export const DropEffect = ({
  dropEffect,
  position,
}: {
  dropEffect?: 'copy' | 'move' | 'link' | undefined;
  position: ReturnType<typeof useDropTarget>['draggedOverPosition'];
}) => {
  const t = useI18n();
  if (dropEffect === undefined) return null;
  return createPortal(
    <div
      className={styles.dropEffect}
      style={{
        transform: `translate(${position.clientX}px, ${position.clientY}px)`,
      }}
    >
      {dropEffect === 'copy' ? (
        <CopyIcon className={styles.icon} />
      ) : dropEffect === 'move' ? (
        <MoveToIcon className={styles.icon} />
      ) : (
        <LinkIcon className={styles.icon} />
      )}
      {dropEffect === 'copy'
        ? t['com.affine.rootAppSidebar.explorer.drop-effect.copy']()
        : dropEffect === 'move'
          ? t['com.affine.rootAppSidebar.explorer.drop-effect.move']()
          : t['com.affine.rootAppSidebar.explorer.drop-effect.link']()}
    </div>,
    document.body
  );
};
