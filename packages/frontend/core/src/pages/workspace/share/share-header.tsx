import { AuthModal } from '@affine/core/components/affine/auth';
import { BlocksuiteHeaderTitle } from '@affine/core/components/blocksuite/block-suite-header/title';
import { EditorModeSwitch } from '@affine/core/components/blocksuite/block-suite-mode-switch';
import ShareHeaderRightItem from '@affine/core/components/cloud/share-header-right-item';
import type { DocMode } from '@blocksuite/blocks';
import type { DocCollection } from '@blocksuite/store';

import * as styles from './share-header.css';

export function ShareHeader({
  pageId,
  publishMode,
  docCollection,
  isTemplate,
  templateName,
}: {
  pageId: string;
  publishMode: DocMode;
  docCollection: DocCollection;
  isTemplate?: boolean;
  templateName?: string;
}) {
  return (
    <div className={styles.header}>
      <EditorModeSwitch />
      <BlocksuiteHeaderTitle docId={pageId} />
      <div className={styles.spacer} />
      <ShareHeaderRightItem
        workspaceId={docCollection.id}
        docId={pageId}
        publishMode={publishMode}
        isTemplate={isTemplate}
        templateName={templateName}
      />
      <AuthModal />
    </div>
  );
}
