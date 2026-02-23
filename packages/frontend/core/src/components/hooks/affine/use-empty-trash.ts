import { toast, useConfirmModal } from '@affine/component';
import { GuardService } from '@affine/core/modules/permissions';
import { UserFriendlyError } from '@affine/error';
import { useI18n } from '@affine/i18n';
import { useService } from '@toeverything/infra';
import { useCallback } from 'react';

import { useBlockSuiteMetaHelper } from './use-block-suite-meta-helper';

export const useEmptyTrash = () => {
  const t = useI18n();
  const guardService = useService(GuardService);
  const { permanentlyDeletePage } = useBlockSuiteMetaHelper();
  const { openConfirmModal } = useConfirmModal();

  const deleteDocs = useCallback(
    (ids: string[]) => {
      let firstError: unknown;

      ids.forEach(id => {
        try {
          permanentlyDeletePage(id);
        } catch (error) {
          console.error(error);
          firstError ??= error;
        }
      });

      if (firstError) {
        const userFriendlyError = UserFriendlyError.fromAny(firstError);
        toast(t[`error.${userFriendlyError.name}`](userFriendlyError.data));
        return;
      }

      toast(t['com.affine.toastMessage.permanentlyDeleted']());
    },
    [permanentlyDeletePage, t]
  );

  const confirmAndEmptyTrash = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) {
        return;
      }

      try {
        const canDeleteDocs = await Promise.all(
          ids.map(id => guardService.can('Doc_Delete', id))
        );
        if (canDeleteDocs.some(canDelete => !canDelete)) {
          toast(t['com.affine.no-permission']());
          return;
        }
      } catch (error) {
        console.error(error);
        const userFriendlyError = UserFriendlyError.fromAny(error);
        toast(t[`error.${userFriendlyError.name}`](userFriendlyError.data));
        return;
      }

      openConfirmModal({
        title: `${t['com.affine.workspaceSubPath.trash.empty']()}?`,
        description: t['com.affine.trashOperation.emptyDescription']({
          count: String(ids.length),
        }),
        cancelText: t['Cancel'](),
        confirmText: t['com.affine.trashOperation.delete'](),
        confirmButtonOptions: {
          variant: 'error',
        },
        onConfirm: () => {
          deleteDocs(ids);
        },
      });
    },
    [deleteDocs, guardService, openConfirmModal, t]
  );

  return {
    deleteDocs,
    confirmAndEmptyTrash,
  };
};
