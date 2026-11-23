import { IconButton, Modal } from '@affine/component';
import { CloseIcon } from '@blocksuite/icons/rc';
import { useCallback } from 'react';

import { RenameContent } from './content';
import * as styles from './dialog.css';
import type { RenameDialogProps } from './type';

export const RenameDialog = ({
  open,
  title,
  onOpenChange,
  onConfirm,
  children,
  ...props
}: RenameDialogProps & {
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
}) => {
  const handleRename = useCallback(
    (value: string) => {
      onConfirm?.(value);
      onOpenChange?.(false);
    },
    [onOpenChange, onConfirm]
  );

  const close = useCallback(() => {
    onOpenChange?.(false);
  }, [onOpenChange]);

  return (
    <Modal
      preserveEditingFocusOnAction
      width="100%"
      open={open}
      onOpenChange={onOpenChange}
      withoutCloseButton
      contentOptions={{
        style: { minHeight: 0, padding: '12px 0', borderRadius: 22 },
      }}
    >
      <div className={styles.header}>
        <span className={styles.title}>{title}</span>
        <IconButton size="24" icon={<CloseIcon />} onClick={close} />
      </div>
      {children ?? <RenameContent onConfirm={handleRename} {...props} />}
    </Modal>
  );
};
