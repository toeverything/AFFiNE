import type { Workspace } from '@blocksuite/store';
import { useSetAtom } from 'jotai/react';

import type { PageMode } from '../atoms';
import { appHeaderAtom, mainContainerAtom } from '../atoms/element';
import { useWorkspace } from '../hooks/use-workspace';
import { BlockSuiteHeaderTitle } from './blocksuite/block-suite-header-title';
import ShareHeaderLeftItem from './cloud/share-header-left-item';
import ShareHeaderRightItem from './cloud/share-header-right-item';
import { Header } from './pure/header';

export function ShareHeader({
  workspace,
  pageId,
  publishMode,
}: {
  workspace: Workspace;
  pageId: string;
  publishMode: PageMode;
}) {
  const setAppHeader = useSetAtom(appHeaderAtom);

  const currentWorkspace = useWorkspace(workspace.id);

  return (
    <Header
      mainContainerAtom={mainContainerAtom}
      ref={setAppHeader}
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
        <ShareHeaderRightItem workspaceId={workspace.id} pageId={pageId} />
      }
      bottomBorder
    />
  );
}
