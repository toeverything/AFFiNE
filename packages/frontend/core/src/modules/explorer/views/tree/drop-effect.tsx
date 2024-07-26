import { useI18n } from '@affine/i18n';
import { CopyIcon, LinkIcon, MoveToIcon } from '@blocksuite/icons/rc';

import * as styles from './drop-effect.css';

export const DropEffect = ({
  dropEffect,
  position,
}: {
  dropEffect?: 'copy' | 'move' | 'link' | undefined;
  position: { x: number; y: number };
}) => {
  const t = useI18n();
  if (dropEffect === undefined) return null;
  return (
    <div
      className={styles.dropEffect}
      style={{
        transform: `translate(${position.x + 10}px, ${position.y + 10}px)`,
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
    </div>
  );
};
