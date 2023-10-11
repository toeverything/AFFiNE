import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { DeleteTemporarilyIcon } from '@blocksuite/icons';
import {
  MenuIcon,
  MenuItem,
  type MenuItemProps,
} from '@toeverything/components/menu';
import {
  ConfirmModal,
  type ConfirmModalProps,
} from '@toeverything/components/modal';

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

const MoveToTrashConfirm = ({
  title,
  ...confirmModalProps
}: {
  title: string;
} & ConfirmModalProps) => {
  const t = useAFFiNEI18N();

  return (
    <ConfirmModal
      title={t['com.affine.moveToTrash.confirmModal.title']()}
      description={t['com.affine.moveToTrash.confirmModal.description']({
        title: title || 'Untitled',
      })}
      cancelText={t['com.affine.confirmModal.button.cancel']()}
      confirmButtonOptions={{
        ['data-testid' as string]: 'confirm-delete-page',
        type: 'error',
        children: t.Delete(),
      }}
      {...confirmModalProps}
    />
  );
};

MoveToTrash.ConfirmModal = MoveToTrashConfirm;
