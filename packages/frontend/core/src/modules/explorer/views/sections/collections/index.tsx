import { IconButton } from '@affine/component';
import { CategoryDivider } from '@affine/core/components/app-sidebar';
import { useEditCollectionName } from '@affine/core/components/page-list';
import { createEmptyCollection } from '@affine/core/components/page-list/use-collection-manager';
import { CollectionService } from '@affine/core/modules/collection';
import { ExplorerTreeRoot } from '@affine/core/modules/explorer/views/tree';
import { WorkbenchService } from '@affine/core/modules/workbench';
import { useI18n } from '@affine/i18n';
import { PlusIcon } from '@blocksuite/icons/rc';
import * as Collapsible from '@radix-ui/react-collapsible';
import { useLiveData, useServices } from '@toeverything/infra';
import { nanoid } from 'nanoid';
import { useCallback, useState } from 'react';

import { ExplorerCollectionNode } from '../../nodes/collection';
import { RootEmpty } from './empty';
import * as styles from './styles.css';

export const ExplorerCollections = ({
  defaultCollapsed = false,
}: {
  defaultCollapsed?: boolean;
}) => {
  const t = useI18n();
  const { collectionService, workbenchService } = useServices({
    CollectionService,
    WorkbenchService,
  });
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
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
        setCollapsed(false);
      })
      .catch(err => {
        console.error(err);
      });
  }, [collectionService, openCreateCollectionModel, workbenchService]);

  return (
    <>
      <Collapsible.Root
        className={styles.container}
        data-testid="explorer-collections"
        open={!collapsed}
      >
        <CategoryDivider
          label={t['com.affine.rootAppSidebar.collections']()}
          setCollapsed={setCollapsed}
          collapsed={collapsed}
        >
          <IconButton
            data-testid="explorer-bar-add-collection-button"
            onClick={handleCreateCollection}
            size="small"
          >
            <PlusIcon />
          </IconButton>
        </CategoryDivider>
        <Collapsible.Content>
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
        </Collapsible.Content>
      </Collapsible.Root>
      {node}
    </>
  );
};
