import { IconButton } from '@affine/component';
import { NavigationPanelService } from '@affine/core/modules/navigation-panel';
import { TagService } from '@affine/core/modules/tag';
import { useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import { AddTagIcon } from '@blocksuite/icons/rc';
import { useLiveData, useServices } from '@toeverything/infra';
import { useCallback, useEffect, useState } from 'react';

import { CollapsibleSection } from '../../layouts/collapsible-section';
import { NavigationPanelTagNode } from '../../nodes/tag';
import { NavigationPanelTreeRoot } from '../../tree';
import { NavigationPanelTreeNodeRenameModal as CreateTagModal } from '../../tree/node';
import { RootEmpty } from './empty';
import * as styles from './styles.css';

export const NavigationPanelTags = () => {
  const { tagService, navigationPanelService } = useServices({
    TagService,
    NavigationPanelService,
  });
  const navigationPanelSection = navigationPanelService.sections.tags;
  const collapsed = useLiveData(navigationPanelSection.collapsed$);
  const [creating, setCreating] = useState(false);
  const tags = useLiveData(tagService.tagList.tags$);

  const t = useI18n();

  const handleCreateNewTag = useCallback(
    (name: string) => {
      tagService.tagList.createTag(name, tagService.randomTagColor());
      track.$.navigationPanel.organize.createOrganizeItem({ type: 'tag' });
      navigationPanelSection.setCollapsed(false);
    },
    [navigationPanelSection, tagService]
  );

  useEffect(() => {
    if (collapsed) setCreating(false);
  }, [collapsed]);

  const handleOpenCreateModal = useCallback(() => {
    setCreating(true);
  }, []);

  return (
    <CollapsibleSection
      name="tags"
      testId="navigation-panel-tags"
      headerClassName={styles.draggedOverHighlight}
      title={t['com.affine.rootAppSidebar.tags']()}
      actions={
        <div className={styles.iconContainer}>
          <IconButton
            data-testid="navigation-panel-bar-add-tag-button"
            onClick={handleOpenCreateModal}
            size="16"
            tooltip={t[
              'com.affine.rootAppSidebar.explorer.tag-section-add-tooltip'
            ]()}
          >
            <AddTagIcon />
          </IconButton>
          {creating && (
            <CreateTagModal
              setRenaming={setCreating}
              handleRename={handleCreateNewTag}
              rawName={t['com.affine.rootAppSidebar.tags.new-tag']()}
              className={styles.createModalAnchor}
            />
          )}
        </div>
      }
    >
      <NavigationPanelTreeRoot placeholder={<RootEmpty />}>
        {tags.map(tag => (
          <NavigationPanelTagNode
            key={tag.id}
            tagId={tag.id}
            reorderable={false}
            location={{
              at: 'navigation-panel:tags:list',
            }}
          />
        ))}
      </NavigationPanelTreeRoot>
    </CollapsibleSection>
  );
};
