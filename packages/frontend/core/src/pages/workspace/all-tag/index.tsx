import {
  TagListHeader,
  VirtualizedTagList,
} from '@affine/core/components/page-list/tags';
import { CreateOrEditTag } from '@affine/core/components/page-list/tags/create-tag';
import type { TagMeta } from '@affine/core/components/page-list/types';
import { TagService } from '@affine/core/modules/tag';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useState } from 'react';

import { ViewBodyIsland, ViewHeaderIsland } from '../../../modules/workbench';
import { EmptyTagList } from '../page-list-empty';
import * as styles from './all-tag.css';
import { AllTagHeader } from './header';

const EmptyTagListHeader = () => {
  const [showCreateTagInput, setShowCreateTagInput] = useState(false);
  const handleOpen = useCallback(() => {
    setShowCreateTagInput(true);
  }, [setShowCreateTagInput]);

  return (
    <div>
      <TagListHeader onOpen={handleOpen} />
      <CreateOrEditTag
        open={showCreateTagInput}
        onOpenChange={setShowCreateTagInput}
      />
    </div>
  );
};

export const AllTag = () => {
  const tagService = useService(TagService);
  const tags = useLiveData(tagService.tags);

  const tagMetas: TagMeta[] = useLiveData(tagService.tagMetas);

  const handleDelete = useCallback(
    (tagIds: string[]) => {
      tagIds.forEach(tagId => {
        tagService.deleteTag(tagId);
      });
    },
    [tagService]
  );

  return (
    <>
      <ViewHeaderIsland>
        <AllTagHeader />
      </ViewHeaderIsland>
      <ViewBodyIsland>
        <div className={styles.body}>
          {tags.length > 0 ? (
            <VirtualizedTagList
              tags={tags}
              tagMetas={tagMetas}
              onTagDelete={handleDelete}
            />
          ) : (
            <EmptyTagList heading={<EmptyTagListHeader />} />
          )}
        </div>
      </ViewBodyIsland>
    </>
  );
};

export const Component = () => {
  return <AllTag />;
};
