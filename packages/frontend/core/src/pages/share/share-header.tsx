import { EditorModeSwitch } from '@affine/core/components/blocksuite/block-suite-mode-switch';
import ShareHeaderRightItem from '@affine/core/components/cloud/share-header-right-item';
import type { DocCollection } from '@blocksuite/store';
import type { DocMode } from '@toeverything/infra';

import { BlocksuiteHeaderTitle } from '../../components/blocksuite/block-suite-header/title/index';
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
      <EditorModeSwitch isPublic pageId={pageId} publicMode={publishMode} />
      <BlocksuiteHeaderTitle
        docCollection={docCollection}
        pageId={pageId}
        isPublic={true}
      />
      <div className={styles.spacer} />
      <ShareHeaderRightItem
        workspaceId={docCollection.id}
        pageId={pageId}
        publishMode={publishMode}
      />
    </div>
  );
}
