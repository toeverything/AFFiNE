import { useNavigateHelper } from '@affine/core/components/hooks/use-navigate-helper';
import { CollectionService } from '@affine/core/modules/collection';
import { WorkspaceService } from '@affine/core/modules/workspace';
import { useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useState } from 'react';

import { CollectionRenameDialog } from '../../../components/navigation/nodes/collection/dialog';
import { MobileAllDocsEmptyState } from '../empty-state';
import { CollectionListItem } from './item';
import { list } from './styles.css';

export const CollectionList = () => {
  const t = useI18n();
  const collectionService = useService(CollectionService);
  const workspace = useService(WorkspaceService).workspace;
  const collectionMetas = useLiveData(collectionService.collectionMetas$);
  const navigateHelper = useNavigateHelper();
  const [showNewCollectionDialog, setShowNewCollectionDialog] = useState(false);

  const handleCreateCollection = useCallback(
    (name: string) => {
      const id = collectionService.createCollection({ name });
      navigateHelper.jumpToCollection(workspace.id, id);
    },
    [collectionService, navigateHelper, workspace.id]
  );

  if (!collectionMetas.length) {
    return (
      <>
        <MobileAllDocsEmptyState
          type="collections"
          onAction={() => setShowNewCollectionDialog(true)}
        />
        <CollectionRenameDialog
          open={showNewCollectionDialog}
          onOpenChange={setShowNewCollectionDialog}
          onConfirm={handleCreateCollection}
          title={t['com.affine.m.explorer.collection.new-dialog-title']()}
          confirmText={t['com.affine.editCollection.save']()}
          inputProps={{
            placeholder: t['com.affine.editCollectionName.name.placeholder'](),
          }}
          descRenderer={() => t['com.affine.editCollectionName.createTips']()}
        />
      </>
    );
  }

  return (
    <ul className={list}>
      {collectionMetas.map(meta => (
        <CollectionListItem key={meta.id} meta={meta} />
      ))}
    </ul>
  );
};
