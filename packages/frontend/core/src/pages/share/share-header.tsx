import { EditorModeSwitch } from '@affine/core/components/blocksuite/block-suite-mode-switch';
import ShareHeaderRightItem from '@affine/core/components/cloud/share-header-right-item';
import type { Workspace as BlockSuiteWorkspace } from '@blocksuite/store';

import type { PageMode } from '../../atoms';
import { BlocksuiteHeaderTitle } from '../../components/blocksuite/block-suite-header/title/index';
import * as styles from './share-header.css';

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
    <div className={styles.header}>
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
      <div className={styles.spacer} />
      <ShareHeaderRightItem
        workspaceId={blockSuiteWorkspace.id}
        pageId={pageId}
        publishMode={publishMode}
      />
    </div>
  );
}
