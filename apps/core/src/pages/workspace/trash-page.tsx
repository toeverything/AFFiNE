import { WorkspaceSubPath } from '@affine/env/workspace';
import { assertExists } from '@blocksuite/global/utils';
import { useCallback } from 'react';

import { getUIAdapter } from '../../adapters/workspace';
import { BlockSuitePageList } from '../../components/blocksuite/block-suite-page-list';
import { useCurrentWorkspace } from '../../hooks/current/use-current-workspace';
import { useNavigateHelper } from '../../hooks/use-navigate-helper';
import { WorkspaceLayout } from '../../layouts/workspace-layout';

const TrashPage = () => {
  const { jumpToPage } = useNavigateHelper();
  const [currentWorkspace] = useCurrentWorkspace();
  const onClickPage = useCallback(
    (pageId: string, newTab?: boolean) => {
      assertExists(currentWorkspace);
      if (newTab) {
        window.open(`/workspace/${currentWorkspace?.id}/${pageId}`, '_blank');
      } else {
        jumpToPage(currentWorkspace.id, pageId);
      }
    },
    [currentWorkspace, jumpToPage]
  );
  // todo(himself65): refactor to plugin
  const blockSuiteWorkspace = currentWorkspace.blockSuiteWorkspace;
  assertExists(blockSuiteWorkspace);
  const { Header } = getUIAdapter(currentWorkspace.flavour);
  return (
    <>
      <Header
        currentWorkspaceId={currentWorkspace.id}
        currentEntry={{
          subPath: WorkspaceSubPath.TRASH,
        }}
      />
      <BlockSuitePageList
        blockSuiteWorkspace={blockSuiteWorkspace}
        onOpenPage={onClickPage}
        listType="trash"
      />
    </>
  );
};

export const Component = () => {
  return (
    <WorkspaceLayout>
      <TrashPage />
    </WorkspaceLayout>
  );
};
