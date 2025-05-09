import {
  CloseIcon,
  DeleteIcon,
  DeletePermanentlyIcon,
  ResetIcon,
} from '@blocksuite/icons/rc';
import type { ReactNode } from 'react';

import { FloatingToolbar } from './floating-toolbar';
import * as styles from './list-floating-toolbar.css';

export const ListFloatingToolbar = ({
  content,
  onClose,
  open,
  onDelete,
  onRestore,
}: {
  open: boolean;
  content: ReactNode;
  onClose: () => void;
  onDelete?: () => void;
  onRestore?: () => void;
}) => {
  return (
    <FloatingToolbar className={styles.floatingToolbar} open={open}>
      <FloatingToolbar.Item>{content}</FloatingToolbar.Item>
      <FloatingToolbar.Button onClick={onClose} icon={<CloseIcon />} />
      {(!!onRestore || !!onDelete) && <FloatingToolbar.Separator />}
      {!!onRestore && (
        <FloatingToolbar.Button
          onClick={onRestore}
          icon={<ResetIcon />}
          data-testid="list-toolbar-restore"
        />
      )}
      {!!onDelete && (
        <FloatingToolbar.Button
          onClick={onDelete}
          icon={onRestore ? <DeletePermanentlyIcon /> : <DeleteIcon />}
          type="danger"
          data-testid="list-toolbar-delete"
        />
      )}
    </FloatingToolbar>
  );
};
