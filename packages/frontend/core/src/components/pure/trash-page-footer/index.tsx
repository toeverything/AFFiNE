import { Button } from '@affine/component/ui/button';
import { ConfirmModal } from '@affine/component/ui/modal';
import { Tooltip } from '@affine/component/ui/tooltip';
import { useBlockSuitePageMeta } from '@affine/core/hooks/use-block-suite-page-meta';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { assertExists } from '@blocksuite/global/utils';
import { DeleteIcon, ResetIcon } from '@blocksuite/icons';
import { useService } from '@toeverything/infra/di';
import { useLiveData } from '@toeverything/infra/livedata';
import { useCallback, useState } from 'react';

import { useAppSettingHelper } from '../../../hooks/affine/use-app-setting-helper';
import { useBlockSuiteMetaHelper } from '../../../hooks/affine/use-block-suite-meta-helper';
import { useNavigateHelper } from '../../../hooks/use-navigate-helper';
import { CurrentWorkspaceService } from '../../../modules/workspace/current-workspace';
import { WorkspaceSubPath } from '../../../shared';
import { toast } from '../../../utils';
import * as styles from './styles.css';

export const TrashPageFooter = ({ pageId }: { pageId: string }) => {
  const workspace = useLiveData(
    useService(CurrentWorkspaceService).currentWorkspace
  );
  assertExists(workspace);
  const blockSuiteWorkspace = workspace.blockSuiteWorkspace;
  const pageMeta = useBlockSuitePageMeta(blockSuiteWorkspace).find(
    meta => meta.id === pageId
  );
  assertExists(pageMeta);
  const t = useAFFiNEI18N();
  const { appSettings } = useAppSettingHelper();
  const { jumpToSubPath } = useNavigateHelper();
  const { restoreFromTrash } = useBlockSuiteMetaHelper(blockSuiteWorkspace);
  const [open, setOpen] = useState(false);
  const hintText = t['com.affine.cmdk.affine.editor.trash-footer-hint']();

  const onRestore = useCallback(() => {
    restoreFromTrash(pageId);
    toast(
      t['com.affine.toastMessage.restored']({
        title: pageMeta.title || 'Untitled',
      })
    );
  }, [pageId, pageMeta.title, restoreFromTrash, t]);

  const onConfirmDelete = useCallback(() => {
    jumpToSubPath(workspace.id, WorkspaceSubPath.ALL);
    blockSuiteWorkspace.removePage(pageId);
    toast(t['com.affine.toastMessage.permanentlyDeleted']());
  }, [blockSuiteWorkspace, jumpToSubPath, pageId, workspace.id, t]);

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
