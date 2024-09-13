import { ConfirmModal } from '@affine/component/ui/modal';
import { openQuotaModalAtom } from '@affine/core/components/atoms';
import { useI18n } from '@affine/i18n';
import { useService, WorkspaceService } from '@toeverything/infra';
import { useAtom } from 'jotai';
import { useCallback, useEffect } from 'react';

export const LocalQuotaModal = () => {
  const t = useI18n();
  const currentWorkspace = useService(WorkspaceService).workspace;
  const [open, setOpen] = useAtom(openQuotaModalAtom);

  const onConfirm = useCallback(() => {
    setOpen(false);
  }, [setOpen]);

  useEffect(() => {
    const disposable = currentWorkspace.engine.blob.onAbortLargeBlob.on(() => {
      setOpen(true);
    });
    return () => {
      disposable?.dispose();
    };
  }, [currentWorkspace.engine.blob.onAbortLargeBlob, setOpen]);

  return (
    <ConfirmModal
      open={open}
      title={t['com.affine.payment.blob-limit.title']()}
      description={t['com.affine.payment.blob-limit.description.local']({
        quota: '100MB',
      })}
      onOpenChange={setOpen}
      cancelButtonOptions={{
        hidden: true,
      }}
      onConfirm={onConfirm}
      confirmText={t['Got it']()}
      confirmButtonOptions={{
        variant: 'primary',
      }}
    />
  );
};
