import { ExplorerService } from '@affine/core/modules/explorer';
import { ExplorerTreeRoot } from '@affine/core/modules/explorer/views/tree';
import type { Tag } from '@affine/core/modules/tag';
import { TagService } from '@affine/core/modules/tag';
import { useI18n } from '@affine/i18n';
import { track } from '@affine/track';
import { useLiveData, useServices } from '@toeverything/infra';
import { useCallback, useEffect, useState } from 'react';

import { AddItemPlaceholder } from '../../layouts/add-item-placeholder';
import { CollapsibleSection } from '../../layouts/collapsible-section';
import { ExplorerTagNode } from '../../nodes/tag';

export const ExplorerTags = () => {
  const { tagService, explorerService } = useServices({
    TagService,
    ExplorerService,
  });
  const explorerSection = explorerService.sections.tags;
  const collapsed = useLiveData(explorerSection.collapsed$);
  const [createdTag, setCreatedTag] = useState<Tag | null>(null);
  const tags = useLiveData(tagService.tagList.tags$);

  const t = useI18n();

  const handleCreateNewFavoriteDoc = useCallback(() => {
    const newTags = tagService.tagList.createTag(
      t['com.affine.rootAppSidebar.tags.new-tag'](),
      tagService.randomTagColor()
    );
    setCreatedTag(newTags);
    track.$.navigationPanel.organize.createOrganizeItem({ type: 'tag' });
    explorerSection.setCollapsed(false);
  }, [explorerSection, t, tagService]);

  useEffect(() => {
    if (collapsed) setCreatedTag(null); // reset created tag to clear the renaming state
  }, [collapsed]);

  return (
    <CollapsibleSection
      name="tags"
      title={t['com.affine.rootAppSidebar.tags']()}
    >
      <ExplorerTreeRoot>
        {tags.map(tag => (
          <ExplorerTagNode
            key={tag.id}
            tagId={tag.id}
            defaultRenaming={createdTag?.id === tag.id}
          />
        ))}
        <AddItemPlaceholder
          data-testid="explorer-bar-add-favorite-button"
          onClick={handleCreateNewFavoriteDoc}
          label={t[
            'com.affine.rootAppSidebar.explorer.tag-section-add-tooltip'
          ]()}
        />
      </ExplorerTreeRoot>
    </CollapsibleSection>
  );
};
