import type { TagLike } from '@affine/component/ui/tags';
import { TagsInlineEditor as TagsInlineEditorComponent } from '@affine/component/ui/tags';
import { TagService, useDeleteTagConfirmModal } from '@affine/core/modules/tag';
import {
  LiveData,
  useLiveData,
  useService,
  WorkspaceService,
} from '@toeverything/infra';
import { useCallback, useMemo } from 'react';

import { useAsyncCallback } from '../hooks/affine-async-hooks';
import { useNavigateHelper } from '../hooks/use-navigate-helper';

interface TagsEditorProps {
  pageId: string;
  readonly?: boolean;
  focusedIndex?: number;
}

interface TagsInlineEditorProps extends TagsEditorProps {
  placeholder?: string;
  className?: string;
}

export const TagsInlineEditor = ({
  pageId,
  readonly,
  placeholder,
  className,
}: TagsInlineEditorProps) => {
  const workspace = useService(WorkspaceService);
  const tagService = useService(TagService);
  const tagIds = useLiveData(tagService.tagList.tagIdsByPageId$(pageId));
  const tags = useLiveData(tagService.tagList.tags$);
  const tagColors = tagService.tagColors;

  const onCreateTag = useCallback(
    (name: string, color: string) => {
      const newTag = tagService.tagList.createTag(name, color);
      return {
        id: newTag.id,
        value: newTag.value$.value,
        color: newTag.color$.value,
      };
    },
    [tagService.tagList]
  );

  const onSelectTag = useCallback(
    (tagId: string) => {
      tagService.tagList.tagByTagId$(tagId).value?.tag(pageId);
    },
    [pageId, tagService.tagList]
  );

  const onDeselectTag = useCallback(
    (tagId: string) => {
      tagService.tagList.tagByTagId$(tagId).value?.untag(pageId);
    },
    [pageId, tagService.tagList]
  );

  const onTagChange = useCallback(
    (id: string, property: keyof TagLike, value: string) => {
      if (property === 'value') {
        tagService.tagList.tagByTagId$(id).value?.rename(value);
      } else if (property === 'color') {
        tagService.tagList.tagByTagId$(id).value?.changeColor(value);
      }
    },
    [tagService.tagList]
  );

  const deleteTags = useDeleteTagConfirmModal();

  const onTagDelete = useAsyncCallback(
    async (id: string) => {
      await deleteTags([id]);
    },
    [deleteTags]
  );

  const adaptedTags = useLiveData(
    useMemo(() => {
      return LiveData.computed(get => {
        return tags.map(tag => ({
          id: tag.id,
          value: get(tag.value$),
          color: get(tag.color$),
        }));
      });
    }, [tags])
  );

  const adaptedTagColors = useMemo(() => {
    return tagColors.map(color => ({
      id: color[0],
      value: color[1],
      name: color[0],
    }));
  }, [tagColors]);

  const navigator = useNavigateHelper();

  const jumpToTag = useCallback(
    (id: string) => {
      navigator.jumpToTag(workspace.workspace.id, id);
    },
    [navigator, workspace.workspace.id]
  );

  return (
    <TagsInlineEditorComponent
      tagMode="inline-tag"
      jumpToTag={jumpToTag}
      readonly={readonly}
      placeholder={placeholder}
      className={className}
      tags={adaptedTags}
      selectedTags={tagIds}
      onCreateTag={onCreateTag}
      onSelectTag={onSelectTag}
      onDeselectTag={onDeselectTag}
      tagColors={adaptedTagColors}
      onTagChange={onTagChange}
      onDeleteTag={onTagDelete}
    />
  );
};
