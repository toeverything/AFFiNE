import { IconButton } from '@affine/component';
import { CategoryDivider } from '@affine/core/components/app-sidebar';
import { ExplorerTreeRoot } from '@affine/core/modules/explorer/views/tree';
import type { Tag } from '@affine/core/modules/tag';
import { TagService } from '@affine/core/modules/tag';
import { useI18n } from '@affine/i18n';
import { PlusIcon } from '@blocksuite/icons/rc';
import { useLiveData, useServices } from '@toeverything/infra';
import { useCallback, useState } from 'react';

import { ExplorerTagNode } from '../../nodes/tag';
import { RootEmpty } from './empty';
import * as styles from './styles.css';

export const ExplorerTags = () => {
  const { tagService } = useServices({
    TagService,
  });
  const [createdTag, setCreatedTag] = useState<Tag | null>(null);

  const tags = useLiveData(tagService.tagList.tags$);

  const t = useI18n();

  const handleCreateNewFavoriteDoc = useCallback(() => {
    const newTags = tagService.tagList.createTag(
      t['com.affine.rootAppSidebar.tags.new-tag'](),
      tagService.randomTagColor()
    );
    setCreatedTag(newTags);
  }, [t, tagService]);

  return (
    <div className={styles.container}>
      <CategoryDivider
        className={styles.draggedOverHighlight}
        label={t['com.affine.rootAppSidebar.tags']()}
      >
        <IconButton
          data-testid="explorer-bar-add-favorite-button"
          onClick={handleCreateNewFavoriteDoc}
          size="small"
        >
          <PlusIcon />
        </IconButton>
      </CategoryDivider>
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
    </div>
  );
};
