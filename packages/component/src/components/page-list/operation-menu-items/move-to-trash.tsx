import type { ConfirmProps } from '@affine/component';
import { Confirm, MenuItem } from '@affine/component';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { DeleteTemporarilyIcon } from '@blocksuite/icons';

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
      >
        {t['Move to Trash']()}
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
      title={t['Delete page?']()}
      content={t['will be moved to Trash']({
        title: title || 'Untitled',
      })}
      confirmText={t.Delete()}
      confirmType="danger"
      {...confirmModalProps}
    />
  );
};

MoveToTrash.ConfirmModal = ConfirmModal;
