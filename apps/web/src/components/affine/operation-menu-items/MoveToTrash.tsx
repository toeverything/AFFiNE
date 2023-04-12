import type { ConfirmProps } from '@affine/component';
import { Confirm, MenuItem } from '@affine/component';
import { useTranslation } from '@affine/i18n';
import { DeleteTemporarilyIcon } from '@blocksuite/icons';
import type { PageMeta } from '@blocksuite/store';

import type { CommonMenuItemProps } from './types';

export const MoveToTrash = ({
  onSelect,
  onItemClick,
  testId,
}: CommonMenuItemProps) => {
  const { t } = useTranslation();

  return (
    <>
      <MenuItem
        data-testid={testId}
        onClick={() => {
          onItemClick?.();
          onSelect?.();
        }}
        icon={<DeleteTemporarilyIcon />}
      >
        {t('Move to Trash')}
      </MenuItem>
    </>
  );
};

const ConfirmModal = ({
  meta,
  ...confirmModalProps
}: {
  meta: PageMeta;
} & ConfirmProps) => {
  const { t } = useTranslation();

  return (
    <Confirm
      title={t('Delete page?')}
      content={t('will be moved to Trash', {
        title: meta.title || 'Untitled',
      })}
      confirmText={t('Delete')}
      confirmType="danger"
      {...confirmModalProps}
    />
  );
};

MoveToTrash.ConfirmModal = ConfirmModal;
