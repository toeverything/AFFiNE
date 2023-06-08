import { Button, Confirm } from '@affine/component';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { assertExists } from '@blocksuite/store';
import { useBlockSuitePageMeta } from '@toeverything/hooks/use-block-suite-page-meta';
import { useRouter } from 'next/router';
import { useState } from 'react';

import { useBlockSuiteMetaHelper } from '../../../../hooks/affine/use-block-suite-meta-helper';
import { useCurrentPageId } from '../../../../hooks/current/use-current-page-id';
import { useCurrentWorkspace } from '../../../../hooks/current/use-current-workspace';

export const TrashButtonGroup = () => {
  // fixme(himself65): remove these hooks ASAP
  const [workspace] = useCurrentWorkspace();
  const [pageId] = useCurrentPageId();
  assertExists(workspace);
  assertExists(pageId);
  const blockSuiteWorkspace = workspace.blockSuiteWorkspace;
  const pageMeta = useBlockSuitePageMeta(blockSuiteWorkspace).find(
    meta => meta.id === pageId
  );
  assertExists(pageMeta);
  const t = useAFFiNEI18N();
  const router = useRouter();
  const { restoreFromTrash } = useBlockSuiteMetaHelper(blockSuiteWorkspace);

  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        bold={true}
        shape="round"
        style={{ marginRight: '24px' }}
        onClick={() => {
          restoreFromTrash(pageId);
        }}
      >
        {t['Restore it']()}
      </Button>
      <Button
        bold={true}
        shape="round"
        type="danger"
        onClick={() => {
          setOpen(true);
        }}
      >
        {t['Delete permanently']()}
      </Button>
      <Confirm
        title={t['TrashButtonGroupTitle']()}
        content={t['TrashButtonGroupDescription']()}
        confirmText={t['Delete']()}
        confirmType="danger"
        open={open}
        onConfirm={() => {
          // fixme(himself65): remove these hooks ASAP
          router
            .push({
              pathname: '/workspace/[workspaceId]/all',
              query: {
                workspaceId: workspace.id,
              },
            })
            .catch(error => {
              console.error(error);
            });
          blockSuiteWorkspace.removePage(pageId);
        }}
        onCancel={() => {
          setOpen(false);
        }}
        onClose={() => {
          setOpen(false);
        }}
      />
    </>
  );
};

export default TrashButtonGroup;
