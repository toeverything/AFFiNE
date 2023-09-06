import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { DeleteTemporarilyIcon } from '@blocksuite/icons';
import {
  MenuIcon,
  MenuItem,
  type MenuItemProps,
} from '@toeverything/components/menu';

import type { ConfirmProps } from '../../..';
import { Confirm } from '../../..';

export const MoveToTrash = (props: MenuItemProps) => {
  const t = useAFFiNEI18N();

  return (
    <MenuItem
      preFix={
        <MenuIcon>
          <DeleteTemporarilyIcon />
        </MenuIcon>
      }
      type="danger"
      {...props}
    >
      {t['com.affine.moveToTrash.title']()}
    </MenuItem>
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
