import { WorkspaceLegacyProperties } from '@affine/core/modules/workspace';
import type { DocMeta } from '@blocksuite/store';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useMemo } from 'react';

interface TagUsageCounts {
  [key: string]: number;
}

export function useTagMetas(pageMetas: DocMeta[]) {
  const legacyProperties = useService(WorkspaceLegacyProperties);
  const tags = useLiveData(legacyProperties.tagOptions$);

  const [tagMetas, tagUsageCounts] = useMemo(() => {
    const tagUsageCounts: TagUsageCounts = {};
    tags.forEach(tag => {
      tagUsageCounts[tag.id] = 0;
    });

    pageMetas.forEach(page => {
      if (!page.tags) {
        return;
      }
      page.tags.forEach(tagId => {
        if (Object.prototype.hasOwnProperty.call(tagUsageCounts, tagId)) {
          tagUsageCounts[tagId]++;
        }
      });
    });

    const tagsList = tags.map(tag => {
      return {
        ...tag,
        title: tag.value,
        color: tag.color,
        pageCount: tagUsageCounts[tag.id] || 0,
      };
    });

    return [tagsList, tagUsageCounts];
  }, [tags, pageMetas]);

  const filterPageMetaByTag = useCallback(
    (tagId: string) => {
      return pageMetas.filter(page => {
        return page.tags.includes(tagId);
      });
    },
    [pageMetas]
  );

  const deleteTags = useCallback(
    (tagIds: string[]) => {
      tagIds.forEach(tagId => {
        legacyProperties.removeTagOption(tagId);
      });
    },
    [legacyProperties]
  );

  return {
    tags,
    tagMetas,
    tagUsageCounts,
    filterPageMetaByTag,
    deleteTags,
  };
}
