import { TagService } from '@affine/core/modules/tag';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useState } from 'react';

import { TagRenameDialog } from '../../../components/navigation/nodes/tag/dialog';
import { MobileAllDocsEmptyState } from '../empty-state';
import { TagItem } from './item';
import { list } from './styles.css';

export const TagList = () => {
  const tagService = useService(TagService);
  const tagList = tagService.tagList;
  const tags = useLiveData(tagList.tags$);
  const [showNewTagDialog, setShowNewTagDialog] = useState(false);

  const handleCreateTag = useCallback(
    (name: string, color: string) => {
      setShowNewTagDialog(false);
      tagList.createTag(name, color);
    },
    [tagList]
  );

  if (!tags.length) {
    return (
      <>
        <MobileAllDocsEmptyState
          type="tags"
          onAction={() => setShowNewTagDialog(true)}
        />
        <TagRenameDialog
          open={showNewTagDialog}
          onOpenChange={setShowNewTagDialog}
          onConfirm={handleCreateTag}
          enableAnimation
        />
      </>
    );
  }

  return (
    <ul className={list}>
      {tags.map(tag => (
        <TagItem key={tag.id} tag={tag} />
      ))}
    </ul>
  );
};
