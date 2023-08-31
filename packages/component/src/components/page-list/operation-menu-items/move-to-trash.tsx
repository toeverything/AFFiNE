import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { DeleteTemporarilyIcon } from '@blocksuite/icons';

import type { ConfirmProps } from '../../..';
import { Confirm, MenuItem } from '../../..';
import { moveToTrashStyle } from './index.css';
import type { CommonMenuItemProps } from './types';

export const MoveToTrash = ({
  onSelect,
  onItemClick,
  ...props
}: CommonMenuItemProps) => {
  const t = useAFFiNEI18N();

  return (
    <>
      <MenuItem
        {...props}
        onClick={() => {
          onItemClick?.();
          onSelect?.();
        }}
        icon={<DeleteTemporarilyIcon />}
        className={moveToTrashStyle}
      >
        {t['com.affine.moveToTrash.title']()}
      </MenuItem>
    </>
  );
};

const ConfirmModal = ({
  title,
  ...confirmModalProps
}: {
  title: string;
} & ConfirmProps) => {
  const t = useAFFiNEI18N();

  return (
    <Confirm
      title={t['com.affine.moveToTrash.confirmModal.title']()}
      content={t['com.affine.moveToTrash.confirmModal.description']({
        title: title || 'Untitled',
      })}
      confirmButtonTestId="confirm-delete-page"
      confirmText={t.Delete()}
      confirmType="error"
      {...confirmModalProps}
    />
  );
};

MoveToTrash.ConfirmModal = ConfirmModal;
