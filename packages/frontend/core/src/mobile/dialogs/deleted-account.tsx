import { ConfirmModal } from '@affine/component';
import {
  RouteLogic,
  useNavigateHelper,
} from '@affine/core/components/hooks/use-navigate-helper';
import type {
  DialogComponentProps,
  GLOBAL_DIALOG_SCHEMA,
} from '@affine/core/modules/dialogs';
import { useI18n } from '@affine/i18n';
import { useCallback } from 'react';

export const DeletedAccountDialog = ({
  close,
}: DialogComponentProps<GLOBAL_DIALOG_SCHEMA['deleted-account']>) => {
  const t = useI18n();
  const { jumpToIndex } = useNavigateHelper();

  const handleDone = useCallback(() => {
    close();
    jumpToIndex(RouteLogic.REPLACE);
  }, [close, jumpToIndex]);

  return (
    <ConfirmModal
      open
      persistent
      title={t['com.affine.setting.account.delete.success-title']()}
      description={
        <>
          <span>
            {t['com.affine.setting.account.delete.success-description-1']()}
          </span>
          <br />
          <br />
          <span>
            {t['com.affine.setting.account.delete.success-description-2']()}
          </span>
        </>
      }
      confirmText={t['Done']()}
      onOpenChange={handleDone}
      onConfirm={handleDone}
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
