import { IconButton } from '@affine/component';
import { CategoryDivider } from '@affine/core/components/app-sidebar';
import { mixpanel } from '@affine/core/mixpanel';
import { ExplorerTreeRoot } from '@affine/core/modules/explorer/views/tree';
import type { Tag } from '@affine/core/modules/tag';
import { TagService } from '@affine/core/modules/tag';
import { useI18n } from '@affine/i18n';
import { PlusIcon } from '@blocksuite/icons/rc';
import * as Collapsible from '@radix-ui/react-collapsible';
import { useLiveData, useServices } from '@toeverything/infra';
import { useCallback, useState } from 'react';

import { ExplorerTagNode } from '../../nodes/tag';
import { RootEmpty } from './empty';
import * as styles from './styles.css';

export const ExplorerTags = ({
  defaultCollapsed = false,
}: {
  defaultCollapsed?: boolean;
}) => {
  const { tagService } = useServices({
    TagService,
  });
  const [createdTag, setCreatedTag] = useState<Tag | null>(null);

  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const tags = useLiveData(tagService.tagList.tags$);

  const t = useI18n();

  const handleCreateNewFavoriteDoc = useCallback(() => {
    const newTags = tagService.tagList.createTag(
      t['com.affine.rootAppSidebar.tags.new-tag'](),
      tagService.randomTagColor()
    );
    setCreatedTag(newTags);
    mixpanel.track('TagCreated', {
      page: 'sidebar',
      module: 'tags',
      control: 'new tag button',
    });
    setCollapsed(false);
  }, [t, tagService]);

  const handleCollapsedChange = useCallback((collapsed: boolean) => {
    if (collapsed) {
      setCreatedTag(null); // reset created tag to clear the renaming state
      setCollapsed(true);
    } else {
      setCollapsed(false);
    }
  }, []);

  return (
    <Collapsible.Root className={styles.container} open={!collapsed}>
      <CategoryDivider
        className={styles.draggedOverHighlight}
        label={t['com.affine.rootAppSidebar.tags']()}
        setCollapsed={handleCollapsedChange}
        collapsed={collapsed}
      >
        <IconButton
          data-testid="explorer-bar-add-favorite-button"
          onClick={handleCreateNewFavoriteDoc}
          size="small"
        >
          <PlusIcon />
        </IconButton>
      </CategoryDivider>
      <Collapsible.Content>
        <ExplorerTreeRoot
          placeholder={<RootEmpty onClickCreate={handleCreateNewFavoriteDoc} />}
        >
          {tags.map(tag => (
            <ExplorerTagNode
              key={tag.id}
              tagId={tag.id}
              reorderable={false}
              location={{
                at: 'explorer:tags:list',
              }}
              defaultRenaming={createdTag?.id === tag.id}
            />
          ))}
        </ExplorerTreeRoot>
      </Collapsible.Content>
    </Collapsible.Root>
  );
};
