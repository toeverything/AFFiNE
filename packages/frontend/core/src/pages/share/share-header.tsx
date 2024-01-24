import { EditorModeSwitch } from '@affine/core/components/blocksuite/block-suite-mode-switch';
import type { Workspace as BlockSuiteWorkspace } from '@blocksuite/store';

import type { PageMode } from '../../atoms';
import { BlocksuiteHeaderTitle } from '../../components/blocksuite/block-suite-header/title/index';
import ShareHeaderLeftItem from '../../components/cloud/share-header-left-item';
import ShareHeaderRightItem from '../../components/cloud/share-header-right-item';
import { Header } from '../../components/pure/header';

export function ShareHeader({
  pageId,
  publishMode,
  blockSuiteWorkspace,
}: {
  pageId: string;
  publishMode: PageMode;
  blockSuiteWorkspace: BlockSuiteWorkspace;
}) {
  return (
    <Header
      isFloat={publishMode === 'edgeless'}
      left={<ShareHeaderLeftItem />}
      center={
        <>
          <EditorModeSwitch
            isPublic
            blockSuiteWorkspace={blockSuiteWorkspace}
            pageId={pageId}
            publicMode={publishMode}
          />
          <BlocksuiteHeaderTitle
            blockSuiteWorkspace={blockSuiteWorkspace}
            pageId={pageId}
            isPublic={true}
          />
        </>
      }
      right={
        <ShareHeaderRightItem
          workspaceId={blockSuiteWorkspace.id}
          pageId={pageId}
          publishMode={publishMode}
        />
      }
      bottomBorder
    />
  );
}
