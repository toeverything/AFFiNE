import { IconButton } from '@affine/component';
import { CategoryDivider } from '@affine/core/components/app-sidebar';
import { useEditCollectionName } from '@affine/core/components/page-list';
import { createEmptyCollection } from '@affine/core/components/page-list/use-collection-manager';
import { CollectionService } from '@affine/core/modules/collection';
import { ExplorerTreeRoot } from '@affine/core/modules/explorer/views/tree';
import { WorkbenchService } from '@affine/core/modules/workbench';
import { useI18n } from '@affine/i18n';
import { PlusIcon } from '@blocksuite/icons/rc';
import { useLiveData, useServices } from '@toeverything/infra';
import { nanoid } from 'nanoid';
import { useCallback } from 'react';

import { ExplorerCollectionNode } from '../../nodes/collection';
import { RootEmpty } from './empty';
import * as styles from './styles.css';

export const ExplorerCollections = () => {
  const t = useI18n();
  const { collectionService, workbenchService } = useServices({
    CollectionService,
    WorkbenchService,
  });
  const collections = useLiveData(collectionService.collections$);
  const { node, open: openCreateCollectionModel } = useEditCollectionName({
    title: t['com.affine.editCollection.createCollection'](),
    showTips: true,
  });

  const handleCreateCollection = useCallback(() => {
    openCreateCollectionModel('')
      .then(name => {
        const id = nanoid();
        collectionService.addCollection(createEmptyCollection(id, { name }));
        workbenchService.workbench.openCollection(id);
      })
      .catch(err => {
        console.error(err);
      });
  }, [collectionService, openCreateCollectionModel, workbenchService]);

  return (
    <>
      <div className={styles.container} data-testid="explorer-collections">
        <CategoryDivider label={t['com.affine.rootAppSidebar.collections']()}>
          <IconButton
            data-testid="explorer-bar-add-collection-button"
            onClick={handleCreateCollection}
            size="small"
          >
            <PlusIcon />
          </IconButton>
        </CategoryDivider>
        <ExplorerTreeRoot
          placeholder={<RootEmpty onClickCreate={handleCreateCollection} />}
        >
          {collections.map(collection => (
            <ExplorerCollectionNode
              key={collection.id}
              collectionId={collection.id}
              reorderable={false}
              location={{
                at: 'explorer:collection:list',
              }}
            />
          ))}
        </ExplorerTreeRoot>
      </div>
      {node}
    </>
  );
};
