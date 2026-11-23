import { ConfirmModal } from '@affine/component';
import { useNavigateHelper } from '@affine/core/components/hooks/use-navigate-helper';
import type {
  DialogComponentProps,
  GLOBAL_DIALOG_SCHEMA,
} from '@affine/core/modules/dialogs';
import { useI18n } from '@affine/i18n';
import { useCallback } from 'react';

import * as styles from './index.css';
export const DeletedAccountDialog = ({
  close,
}: DialogComponentProps<GLOBAL_DIALOG_SCHEMA['deleted-account']>) => {
  const t = useI18n();
  const { jumpToIndex } = useNavigateHelper();
  const callback = useCallback(() => {
    jumpToIndex();
  }, [jumpToIndex]);

  const handleOpenChange = useCallback(() => {
    callback();
    close();
  }, [callback, close]);
  return (
    <ConfirmModal
      open
      persistent
      title={t['com.affine.setting.account.delete.success-title']()}
      description={
        <span className={styles.successDeleteAccountContainer}>
          {t['com.affine.setting.account.delete.success-description-1']()}
          <span>
            {t['com.affine.setting.account.delete.success-description-2']()}
          </span>
        </span>
      }
      confirmText={t['Confirm']()}
      onOpenChange={handleOpenChange}
      onConfirm={handleOpenChange}
      confirmButtonOptions={{
        variant: 'primary',
      }}
      cancelButtonOptions={{
        style: {
          display: 'none',
        },
      }}
    />
  );
};
