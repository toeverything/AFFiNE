import { Button, useConfirmModal } from '@affine/component';
import { usePageHelper } from '@affine/core/blocksuite/block-suite-page-list/utils';
import { PageListNewPageButton } from '@affine/core/components/page-list';
import {
  type Collection,
  CollectionService,
} from '@affine/core/modules/collection';
import { WorkspaceDialogService } from '@affine/core/modules/dialogs';
import type { DocRecord } from '@affine/core/modules/doc';
import { WorkbenchLink } from '@affine/core/modules/workbench';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { useI18n } from '@affine/i18n';
import track from '@affine/track';
import type { DocMode } from '@blocksuite/affine/model';
import { ViewLayersIcon } from '@blocksuite/icons/rc';
import { useLiveData, useServices } from '@toeverything/infra';
import { useCallback } from 'react';

import * as styles from './index.css';

export const CollectionListHeader = ({
  collection,
}: {
  collection: Collection;
}) => {
  const t = useI18n();
  const { collectionService, workspaceService, workspaceDialogService } =
    useServices({
      CollectionService,
      WorkspaceService,
      WorkspaceDialogService,
    });

  const handleEdit = useCallback(() => {
    track.collection.collection.$.editCollection();
    workspaceDialogService.open('collection-editor', {
      collectionId: collection.id,
    });
  }, [collection, workspaceDialogService]);

  const workspace = workspaceService.workspace;
  const { createEdgeless, createPage } = usePageHelper(workspace.docCollection);
  const { openConfirmModal } = useConfirmModal();
  const name = useLiveData(collection.name$);

  const createAndAddDocument = useCallback(
    (createDocumentFn: () => DocRecord) => {
      const newDoc = createDocumentFn();
      collectionService.addDocToCollection(collection.id, newDoc.id);
    },
    [collection.id, collectionService]
  );

  const onConfirmAddDocument = useCallback(
    (createDocumentFn: () => DocRecord) => {
      openConfirmModal({
        title: t['com.affine.collection.add-doc.confirm.title'](),
        description: t['com.affine.collection.add-doc.confirm.description'](),
        cancelText: t['Cancel'](),
        confirmText: t['Confirm'](),
        confirmButtonOptions: {
          variant: 'primary',
        },
        onConfirm: () => createAndAddDocument(createDocumentFn),
      });
    },
    [openConfirmModal, t, createAndAddDocument]
  );

  const createPageModeDoc = useCallback(
    () => createPage('page' as DocMode),
    [createPage]
  );

  const onCreateEdgeless = useCallback(
    () => onConfirmAddDocument(createEdgeless),
    [createEdgeless, onConfirmAddDocument]
  );
  const onCreatePage = useCallback(() => {
    onConfirmAddDocument(createPageModeDoc);
  }, [createPageModeDoc, onConfirmAddDocument]);
  const onCreateDoc = useCallback(() => {
    onConfirmAddDocument(createPage);
  }, [createPage, onConfirmAddDocument]);

  return (
    <header className={styles.collectionHeader}>
      <div className={styles.breadcrumb}>
        <div className={styles.breadcrumbItem}>
          <WorkbenchLink to="/collection" className={styles.breadcrumbLink}>
            {t['com.affine.collections.header']()}
          </WorkbenchLink>
        </div>
        <div className={styles.breadcrumbSeparator}>/</div>
        <div className={styles.breadcrumbItem} data-active={true}>
          <ViewLayersIcon className={styles.breadcrumbIcon} />
          {name}
        </div>
      </div>

      <div className={styles.headerActions}>
        <Button onClick={handleEdit}>{t['Edit']()}</Button>
        <PageListNewPageButton
          size="small"
          data-testid="new-page-button-trigger"
          onCreateDoc={onCreateDoc}
          onCreateEdgeless={onCreateEdgeless}
          onCreatePage={onCreatePage}
        >
          <div className={styles.newPageButtonText}>{t['New Page']()}</div>
        </PageListNewPageButton>
      </div>
    </header>
  );
};
