import { toast } from '@affine/component';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import type { Workspace } from '@blocksuite/store';
import { useAtom } from 'jotai';
import { useCallback } from 'react';

import { trashModalAtom } from '../../atoms/trash-modal';
import { useBlockSuiteMetaHelper } from './use-block-suite-meta-helper';

export function useTrashModalHelper(blocksuiteWorkspace: Workspace) {
  const t = useAFFiNEI18N();
  const [trashModal, setTrashModal] = useAtom(trashModalAtom);
  const { pageId } = trashModal;
  const { removeToTrash } = useBlockSuiteMetaHelper(blocksuiteWorkspace);

  const handleOnConfirm = useCallback(() => {
    removeToTrash(pageId);
    toast(t['com.affine.toastMessage.movedTrash']());
    setTrashModal({ ...trashModal, open: false });
  }, [pageId, removeToTrash, setTrashModal, t, trashModal]);

  return {
    trashModal,
    setTrashModal,
    handleOnConfirm,
  };
}
