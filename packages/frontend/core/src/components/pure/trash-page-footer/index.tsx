import { Button } from '@affine/component/ui/button';
import { ConfirmModal } from '@affine/component/ui/modal';
import { Tooltip } from '@affine/component/ui/tooltip';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { DeleteIcon, ResetIcon } from '@blocksuite/icons/rc';
import { DocService, useService, WorkspaceService } from '@toeverything/infra';
import { useCallback, useState } from 'react';

import { useAppSettingHelper } from '../../../hooks/affine/use-app-setting-helper';
import { useBlockSuiteMetaHelper } from '../../../hooks/affine/use-block-suite-meta-helper';
import { useNavigateHelper } from '../../../hooks/use-navigate-helper';
import { WorkspaceSubPath } from '../../../shared';
import { toast } from '../../../utils';
import * as styles from './styles.css';

export const TrashPageFooter = () => {
  const workspace = useService(WorkspaceService).workspace;
  const docCollection = workspace.docCollection;
  const doc = useService(DocService).doc;
  const t = useAFFiNEI18N();
  const { appSettings } = useAppSettingHelper();
  const { jumpToSubPath } = useNavigateHelper();
  const { restoreFromTrash } = useBlockSuiteMetaHelper(docCollection);
  const [open, setOpen] = useState(false);
  const hintText = t['com.affine.cmdk.affine.editor.trash-footer-hint']();

  const onRestore = useCallback(() => {
    restoreFromTrash(doc.id);
    toast(
      t['com.affine.toastMessage.restored']({
        title: doc.meta$.value.title || 'Untitled',
      })
    );
  }, [doc.id, doc.meta$.value.title, restoreFromTrash, t]);

  const onConfirmDelete = useCallback(() => {
    jumpToSubPath(workspace.id, WorkspaceSubPath.ALL);
    docCollection.removeDoc(doc.id);
    toast(t['com.affine.toastMessage.permanentlyDeleted']());
  }, [jumpToSubPath, workspace.id, docCollection, doc.id, t]);

  const onDelete = useCallback(() => {
    setOpen(true);
  }, []);

  return (
    <div
      className={styles.deleteHintContainer}
      data-has-background={!appSettings.clientBorder}
    >
      <div className={styles.deleteHintText}>{hintText}</div>
      <div className={styles.group}>
        <Tooltip content={t['com.affine.trashOperation.restoreIt']()}>
          <Button
            data-testid="page-restore-button"
            type="primary"
            onClick={onRestore}
            className={styles.buttonContainer}
          >
            <div className={styles.icon}>
              <ResetIcon />
            </div>
          </Button>
        </Tooltip>
        <Tooltip content={t['com.affine.trashOperation.deletePermanently']()}>
          <Button
            type="error"
            onClick={onDelete}
            style={{ color: 'var(--affine-pure-white)' }}
            className={styles.buttonContainer}
          >
            <div className={styles.icon}>
              <DeleteIcon />
            </div>
          </Button>
        </Tooltip>
      </div>
      <ConfirmModal
        title={t['com.affine.trashOperation.delete.title']()}
        cancelText={t['com.affine.confirmModal.button.cancel']()}
        description={t['com.affine.trashOperation.delete.description']()}
        confirmButtonOptions={{
          type: 'error',
          children: t['com.affine.trashOperation.delete'](),
        }}
        open={open}
        onConfirm={onConfirmDelete}
        onOpenChange={setOpen}
      />
    </div>
  );
};
