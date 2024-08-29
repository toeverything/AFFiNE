import { BlocksuiteHeaderTitle } from '@affine/core/components/blocksuite/block-suite-header/title';
import { EditorModeSwitch } from '@affine/core/components/blocksuite/block-suite-mode-switch';
import ShareHeaderRightItem from '@affine/core/components/cloud/share-header-right-item';
import { AuthModal } from '@affine/core/providers/modal-provider';
import type { DocCollection } from '@blocksuite/store';
import type { DocMode } from '@toeverything/infra';

import * as styles from './share-header.css';

export function ShareHeader({
  pageId,
  publishMode,
  docCollection,
}: {
  pageId: string;
  publishMode: DocMode;
  docCollection: DocCollection;
}) {
  return (
    <div className={styles.header}>
      <EditorModeSwitch />
      <BlocksuiteHeaderTitle docId={pageId} />
      <div className={styles.spacer} />
      <ShareHeaderRightItem
        workspaceId={docCollection.id}
        pageId={pageId}
        publishMode={publishMode}
      />
      <AuthModal />
    </div>
  );
}
