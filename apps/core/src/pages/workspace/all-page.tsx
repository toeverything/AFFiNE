import { useCollectionManager } from '@affine/component/page-list';
import { WorkspaceSubPath } from '@affine/env/workspace';
import { assertExists } from '@blocksuite/global/utils';
import { useCallback } from 'react';

import { getUIAdapter } from '../../adapters/workspace';
import { useCurrentWorkspace } from '../../hooks/current/use-current-workspace';
import { useNavigateHelper } from '../../hooks/use-navigate-helper';
import { WorkspaceLayout } from '../../layouts/workspace-layout';

const AllPage = () => {
  const { jumpToPage } = useNavigateHelper();
  const [currentWorkspace] = useCurrentWorkspace();
  const setting = useCollectionManager(currentWorkspace.id);
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
  const { PageList, Header } = getUIAdapter(currentWorkspace.flavour);
  return (
    <>
      <Header
        currentWorkspaceId={currentWorkspace.id}
        currentEntry={{
          subPath: WorkspaceSubPath.ALL,
        }}
      />
      <PageList
        collection={setting.currentCollection}
        onOpenPage={onClickPage}
        blockSuiteWorkspace={currentWorkspace.blockSuiteWorkspace}
      />
    </>
  );
};

export const Component = () => {
  return (
    <WorkspaceLayout>
      <AllPage />
    </WorkspaceLayout>
  );
};
