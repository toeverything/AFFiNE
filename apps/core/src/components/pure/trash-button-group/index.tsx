import { Confirm } from '@affine/component';
import { WorkspaceSubPath } from '@affine/env/workspace';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { assertExists } from '@blocksuite/global/utils';
import { Button } from '@toeverything/components/button';
import { useBlockSuitePageMeta } from '@toeverything/hooks/use-block-suite-page-meta';
import { currentPageIdAtom } from '@toeverything/infra/atom';
import { useAtomValue } from 'jotai';
import { useCallback, useState } from 'react';

import { useBlockSuiteMetaHelper } from '../../../hooks/affine/use-block-suite-meta-helper';
import { useCurrentWorkspace } from '../../../hooks/current/use-current-workspace';
import { useNavigateHelper } from '../../../hooks/use-navigate-helper';
import { toast } from '../../../utils';
import { buttonContainer, group } from './styles.css';

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
  const { jumpToSubPath } = useNavigateHelper();
  const { restoreFromTrash } = useBlockSuiteMetaHelper(blockSuiteWorkspace);

  const [open, setOpen] = useState(false);

  return (
    <div className={group}>
      <div className={buttonContainer}>
        <Button
          data-testid="page-restore-button"
          type="primary"
          onClick={() => {
            restoreFromTrash(pageId);
            toast(t['restored']({ title: pageMeta.title || 'Untitled' }));
          }}
          size="large"
        >
          {t['Restore it']()}
        </Button>
      </div>
      <div className={buttonContainer}>
        <Button
          type="error"
          onClick={() => {
            setOpen(true);
          }}
          size="large"
        >
          {t['Delete permanently']()}
        </Button>
      </div>
      <Confirm
        title={t['TrashButtonGroupTitle']()}
        content={t['TrashButtonGroupDescription']()}
        confirmText={t['Delete']()}
        confirmType="error"
        open={open}
        onConfirm={useCallback(() => {
          jumpToSubPath(workspace.id, WorkspaceSubPath.ALL);
          blockSuiteWorkspace.removePage(pageId);
          toast(t['Permanently deleted']());
        }, [blockSuiteWorkspace, jumpToSubPath, pageId, workspace.id, t])}
        onCancel={() => {
          setOpen(false);
        }}
        onClose={() => {
          setOpen(false);
        }}
      />
    </div>
  );
};

export default TrashButtonGroup;
