import { usePromptModal } from '@affine/component';
import { NavigationPanelTreeRoot } from '@affine/core/desktop/components/navigation-panel';
import { CollectionService } from '@affine/core/modules/collection';
import { NavigationPanelService } from '@affine/core/modules/navigation-panel';
import { WorkbenchService } from '@affine/core/modules/workbench';
import { useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import { AddCollectionIcon } from '@blocksuite/icons/rc';
import { useLiveData, useServices } from '@toeverything/infra';
import { useCallback } from 'react';

import { AddItemPlaceholder } from '../../layouts/add-item-placeholder';
import { CollapsibleSection } from '../../layouts/collapsible-section';
import { NavigationPanelCollectionNode } from '../../nodes/collection';
import * as styles from './index.css';

export const NavigationPanelCollections = () => {
  const t = useI18n();
  const { collectionService, workbenchService, navigationPanelService } =
    useServices({
      CollectionService,
      WorkbenchService,
      NavigationPanelService,
    });
  const navigationPanelSection = navigationPanelService.sections.collections;
  const collectionMetas = useLiveData(collectionService.collectionMetas$);
  const { openPromptModal } = usePromptModal();

  const handleCreateCollection = useCallback(() => {
    openPromptModal({
      title: t['com.affine.editCollection.saveCollection'](),
      label: t['com.affine.editCollectionName.name'](),
      inputOptions: {
        placeholder: t['com.affine.editCollectionName.name.placeholder'](),
      },
      children: (
        <div className={styles.createTips}>
          {t['com.affine.editCollectionName.createTips']()}
        </div>
      ),
      confirmText: t['com.affine.editCollection.save'](),
      cancelText: t['com.affine.editCollection.button.cancel'](),
      confirmButtonOptions: {
        variant: 'primary',
      },
      onConfirm(name) {
        const id = collectionService.createCollection({ name });
        track.$.navigationPanel.organize.createOrganizeItem({
          type: 'collection',
        });
        workbenchService.workbench.openCollection(id);
        navigationPanelSection.setCollapsed(false);
      },
    });
  }, [
    collectionService,
    navigationPanelSection,
    openPromptModal,
    t,
    workbenchService.workbench,
  ]);

  return (
    <CollapsibleSection
      name="collections"
      testId="navigation-panel-collections"
      title={t['com.affine.rootAppSidebar.collections']()}
    >
      <NavigationPanelTreeRoot>
        {collectionMetas.map(collection => (
          <NavigationPanelCollectionNode
            key={collection.id}
            collectionId={collection.id}
          />
        ))}
        <AddItemPlaceholder
          icon={<AddCollectionIcon />}
          data-testid="navigation-panel-bar-add-collection-button"
          label={t['com.affine.rootAppSidebar.collection.new']()}
          onClick={() => handleCreateCollection()}
        />
      </NavigationPanelTreeRoot>
    </CollapsibleSection>
  );
};
