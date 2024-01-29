import { CloseIcon, DeleteIcon } from '@blocksuite/icons';
import type { ReactNode } from 'react';

import { FloatingToolbar } from './floating-toolbar';
import * as styles from './list-floating-toolbar.css';

export const ListFloatingToolbar = ({
  content,
  onClose,
  open,
  onDelete,
}: {
  open: boolean;
  content: ReactNode;
  onClose: () => void;
  onDelete: () => void;
}) => {
  return (
    <FloatingToolbar className={styles.floatingToolbar} open={open}>
      <FloatingToolbar.Item>{content}</FloatingToolbar.Item>
      <FloatingToolbar.Button onClick={onClose} icon={<CloseIcon />} />
      <FloatingToolbar.Separator />
      <FloatingToolbar.Button
        onClick={onDelete}
        icon={<DeleteIcon />}
        type="danger"
        data-testid="list-toolbar-delete"
      />
    </FloatingToolbar>
  );
};
