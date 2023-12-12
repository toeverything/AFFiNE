import type { Workspace } from '@blocksuite/store';

import type { PageMode } from '../../atoms';
import { BlockSuiteHeaderTitle } from '../../components/blocksuite/block-suite-header-title';
import ShareHeaderLeftItem from '../../components/cloud/share-header-left-item';
import ShareHeaderRightItem from '../../components/cloud/share-header-right-item';
import { Header } from '../../components/pure/header';
import { useWorkspace } from '../../hooks/use-workspace';

export function ShareHeader({
  workspace,
  pageId,
  publishMode,
}: {
  workspace: Workspace;
  pageId: string;
  publishMode: PageMode;
}) {
  const currentWorkspace = useWorkspace(workspace.id);

  return (
    <Header
      isFloat={publishMode === 'edgeless'}
      left={<ShareHeaderLeftItem />}
      center={
        <BlockSuiteHeaderTitle
          workspace={currentWorkspace}
          pageId={pageId}
          isPublic={true}
          publicMode={publishMode}
        />
      }
      right={
        <ShareHeaderRightItem
          workspaceId={workspace.id}
          pageId={pageId}
          publishMode={publishMode}
        />
      }
      bottomBorder
    />
  );
}
