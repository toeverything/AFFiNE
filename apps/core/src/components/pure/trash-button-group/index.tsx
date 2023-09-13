import { WorkspaceSubPath } from '@affine/env/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { assertExists } from '@blocksuite/global/utils';
import { DeleteIcon, ResetIcon } from '@blocksuite/icons';
import { IconButton } from '@toeverything/components/button';
import { ConfirmModal } from '@toeverything/components/modal';
import { Tooltip } from '@toeverything/components/tooltip';
import { useBlockSuitePageMeta } from '@toeverything/hooks/use-block-suite-page-meta';
import { currentPageIdAtom } from '@toeverything/infra/atom';
import { useAtomValue } from 'jotai';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useAppSetting } from '../../../atoms/settings';
import { useBlockSuiteMetaHelper } from '../../../hooks/affine/use-block-suite-meta-helper';
import { useCurrentWorkspace } from '../../../hooks/current/use-current-workspace';
import { useNavigateHelper } from '../../../hooks/use-navigate-helper';
import { toast } from '../../../utils';
import * as styles from './styles.css';

export const TrashButtonGroup = () => {
  // fixme(himself65): remove these hooks ASAP
  const [workspace] = useCurrentWorkspace();
  const pageId = useAtomValue(currentPageIdAtom);
  assertExists(workspace);
  assertExists(pageId);
  const blockSuiteWorkspace = workspace.blockSuiteWorkspace;
  const pageMeta = useBlockSuitePageMeta(blockSuiteWorkspace).find(
    meta => meta.id === pageId
  );
  assertExists(pageMeta);
  const t = useAFFiNEI18N();
  const [appSettings] = useAppSetting();
  const { jumpToSubPath } = useNavigateHelper();
  const { restoreFromTrash } = useBlockSuiteMetaHelper(blockSuiteWorkspace);
  const restoreRef = useRef(null);
  const deleteRef = useRef(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const currentRef = wrapperRef.current;

    if (!currentRef) {
      return;
    }

    const handleResize = () => {
      if (!currentRef) {
        return;
      }

      const wrapperWidth = currentRef?.offsetWidth || 0;
      setWidth(wrapperWidth);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(currentRef);

    return () => {
      resizeObserver.unobserve(currentRef);
    };
  }, []);

  return (
    <div ref={wrapperRef} style={{ width: '100%' }}>
      <div
        className={styles.deleteHintContainer}
        style={{
          width: `${width}px`,
        }}
        data-has-background={!appSettings.clientBorder}
      >
        <div className={styles.deleteHintText}>
          This page has been moved to the trash, you can either restore or
          permanently delete it.
        </div>
        <div className={styles.group}>
          <div className={styles.buttonContainer}>
            <Tooltip
              content={t['com.affine.trashOperation.restoreIt']()}
              portalOptions={{ container: restoreRef.current }}
            >
              <IconButton
                ref={restoreRef}
                data-testid="page-restore-button"
                type="primary"
                onClick={() => {
                  restoreFromTrash(pageId);
                  toast(
                    t['com.affine.toastMessage.restored']({
                      title: pageMeta.title || 'Untitled',
                    })
                  );
                }}
                size="large"
                icon={<ResetIcon />}
                style={{ color: 'var(--affine-pure-white)' }}
              />
            </Tooltip>
          </div>
          <div className={styles.buttonContainer}>
            <Tooltip
              content={t['com.affine.trashOperation.deletePermanently']()}
              portalOptions={{ container: deleteRef.current }}
            >
              <IconButton
                ref={deleteRef}
                type="error"
                onClick={() => {
                  setOpen(true);
                }}
                size="large"
                style={{ color: 'var(--affine-pure-white)' }}
                icon={<DeleteIcon />}
              />
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
            onConfirm={useCallback(() => {
              jumpToSubPath(workspace.id, WorkspaceSubPath.ALL);
              blockSuiteWorkspace.removePage(pageId);
              toast(t['com.affine.toastMessage.permanentlyDeleted']());
            }, [blockSuiteWorkspace, jumpToSubPath, pageId, workspace.id, t])}
            onOpenChange={setOpen}
          />
        </div>
      </div>
    </div>
  );
};

export default TrashButtonGroup;
