import { IconButton } from '@affine/component';
import { useEditCollectionName } from '@affine/core/components/page-list';
import { createEmptyCollection } from '@affine/core/components/page-list/use-collection-manager';
import { CollectionService } from '@affine/core/modules/collection';
import { ExplorerTreeRoot } from '@affine/core/modules/explorer/views/tree';
import { WorkbenchService } from '@affine/core/modules/workbench';
import { useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import { PlusIcon } from '@blocksuite/icons/rc';
import { useLiveData, useServices } from '@toeverything/infra';
import { nanoid } from 'nanoid';
import { useCallback } from 'react';

import { ExplorerService } from '../../../services/explorer';
import { CollapsibleSection } from '../../layouts/collapsible-section';
import { ExplorerCollectionNode } from '../../nodes/collection';
import { RootEmpty } from './empty';

export const ExplorerCollections = () => {
  const t = useI18n();
  const { collectionService, workbenchService, explorerService } = useServices({
    CollectionService,
    WorkbenchService,
    ExplorerService,
  });
  const explorerSection = explorerService.sections.collections;
  const collections = useLiveData(collectionService.collections$);
  const { open: openCreateCollectionModel } = useEditCollectionName({
    title: t['com.affine.editCollection.createCollection'](),
    showTips: true,
  });

  const handleCreateCollection = useCallback(() => {
    openCreateCollectionModel('')
      .then(name => {
        const id = nanoid();
        collectionService.addCollection(createEmptyCollection(id, { name }));
        track.$.navigationPanel.organize.createOrganizeItem({
          type: 'collection',
        });
        workbenchService.workbench.openCollection(id);
        explorerSection.setCollapsed(false);
      })
      .catch(err => {
        console.error(err);
      });
  }, [
    collectionService,
    explorerSection,
    openCreateCollectionModel,
    workbenchService.workbench,
  ]);

  return (
    <CollapsibleSection
      name="collections"
      testId="explorer-collections"
      title={t['com.affine.rootAppSidebar.collections']()}
      actions={
        <IconButton
          data-testid="explorer-bar-add-collection-button"
          onClick={handleCreateCollection}
          size="16"
          tooltip={t[
            'com.affine.rootAppSidebar.explorer.collection-section-add-tooltip'
          ]()}
        >
          <PlusIcon />
        </IconButton>
      }
    >
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
    </CollapsibleSection>
  );
};
