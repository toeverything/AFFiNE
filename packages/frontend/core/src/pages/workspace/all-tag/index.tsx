import {
  TagListHeader,
  VirtualizedTagList,
} from '@affine/core/components/page-list/tags';
import { CreateOrEditTag } from '@affine/core/components/page-list/tags/create-tag';
import type { TagMeta } from '@affine/core/components/page-list/types';
import { DeleteTagConfirmModal, TagService } from '@affine/core/modules/tag';
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
  const tags = useLiveData(tagService.tags$);
  const [open, setOpen] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);

  const tagMetas: TagMeta[] = useLiveData(tagService.tagMetas$);

  const handleCloseModal = useCallback(
    (open: boolean) => {
      setOpen(open);
      setSelectedTagIds([]);
    },
    [setOpen]
  );

  const onTagDelete = useCallback(
    (tagIds: string[]) => {
      setOpen(true);
      setSelectedTagIds(tagIds);
    },
    [setOpen, setSelectedTagIds]
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
              onTagDelete={onTagDelete}
            />
          ) : (
            <EmptyTagList heading={<EmptyTagListHeader />} />
          )}
        </div>
      </ViewBodyIsland>
      <DeleteTagConfirmModal
        open={open}
        onOpenChange={handleCloseModal}
        selectedTagIds={selectedTagIds}
      />
    </>
  );
};

export const Component = () => {
  return <AllTag />;
};
