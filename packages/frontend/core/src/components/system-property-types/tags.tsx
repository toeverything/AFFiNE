import type { FilterParams } from '@affine/core/modules/collection-rules';
import { TagService } from '@affine/core/modules/tag';
import { useI18n } from '@affine/i18n';
import { useLiveData, useService } from '@toeverything/infra';
import { cssVarV2 } from '@toeverything/theme/v2';
import { useCallback, useMemo } from 'react';

import { WorkspaceTagsInlineEditor } from '../tags';

export const TagsFilterValue = ({
  filter,
  onChange,
}: {
  filter: FilterParams;
  onChange: (filter: FilterParams) => void;
}) => {
  const t = useI18n();
  const tagService = useService(TagService);
  const allTagMetas = useLiveData(tagService.tagList.tagMetas$);

  const selectedTags = useMemo(
    () =>
      filter.value
        ?.split(',')
        .filter(id => allTagMetas.some(tag => tag.id === id)) ?? [],
    [filter, allTagMetas]
  );

  const handleSelectTag = useCallback(
    (tagId: string) => {
      onChange({
        ...filter,
        value: [...selectedTags, tagId].join(','),
      });
    },
    [filter, onChange, selectedTags]
  );

  const handleDeselectTag = useCallback(
    (tagId: string) => {
      onChange({
        ...filter,
        value: selectedTags.filter(id => id !== tagId).join(','),
      });
    },
    [filter, onChange, selectedTags]
  );

  return filter.method !== 'is-not-empty' && filter.method !== 'is-empty' ? (
    <WorkspaceTagsInlineEditor
      placeholder={
        <span style={{ color: cssVarV2('text/placeholder') }}>
          {t['com.affine.filter.empty']()}
        </span>
      }
      selectedTags={selectedTags}
      onSelectTag={handleSelectTag}
      onDeselectTag={handleDeselectTag}
      tagMode="inline-tag"
    />
  ) : undefined;
};
