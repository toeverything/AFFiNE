import type { ConfirmModalProps, MenuItemProps } from '@affine/component';
import { ConfirmModal, MenuIcon, MenuItem } from '@affine/component';
import { useI18n } from '@affine/i18n';
import { DeleteIcon } from '@blocksuite/icons/rc';
import { useCallback } from 'react';

export const MoveToTrash = (props: MenuItemProps) => {
  const t = useI18n();

  return (
    <MenuItem
      preFix={
        <MenuIcon>
          <DeleteIcon />
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
  titles,
  ...confirmModalProps
}: {
  titles: string[];
} & ConfirmModalProps) => {
  const t = useI18n();
  const multiple = titles.length > 1;
  const title = multiple
    ? t['com.affine.moveToTrash.confirmModal.title.multiple']({
        number: titles.length.toString(),
      })
    : t['com.affine.moveToTrash.confirmModal.title']();
  const description = multiple
    ? t['com.affine.moveToTrash.confirmModal.description.multiple']({
        number: titles.length.toString(),
      })
    : t['com.affine.moveToTrash.confirmModal.description']({
        title: titles[0] || t['Untitled'](),
      });
  const onOpenAutoFocus = useCallback((e: Event) => {
    e.preventDefault();
    const button = document.querySelector<HTMLButtonElement>(
      '[data-testid="confirm-delete-page"]'
    );
    if (button) {
      console.log('button', button);
      button.focus();
    }
  }, []);
  return (
    <ConfirmModal
      title={title}
      description={description}
      cancelText={t['com.affine.confirmModal.button.cancel']()}
      confirmText={t.Delete()}
      confirmButtonOptions={{
        ['data-testid' as string]: 'confirm-delete-page',
        variant: 'error',
      }}
      onOpenAutoFocus={onOpenAutoFocus}
      {...confirmModalProps}
    />
  );
};

MoveToTrash.ConfirmModal = MoveToTrashConfirm;
