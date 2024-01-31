import { ConfirmModal } from '@affine/component/ui/modal';
import { openQuotaModalAtom } from '@affine/core/atoms';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useService, Workspace } from '@toeverything/infra';
import { useAtom } from 'jotai';
import { useCallback, useEffect } from 'react';

export const LocalQuotaModal = () => {
  const t = useAFFiNEI18N();
  const currentWorkspace = useService(Workspace);
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
      confirmButtonOptions={{
        type: 'primary',
        children: t['Got it'](),
      }}
    />
  );
};
