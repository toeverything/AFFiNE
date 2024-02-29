import type { DocMeta, Tag, Workspace } from '@blocksuite/store';
import { useCallback, useMemo } from 'react';

interface TagUsageCounts {
  [key: string]: number;
}

export function useTagMetas(currentWorkspace: Workspace, pageMetas: DocMeta[]) {
  const tags = useMemo(() => {
    return currentWorkspace.meta.properties.tags?.options || [];
  }, [currentWorkspace]);

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

  const addNewTag = useCallback(
    (tag: Tag) => {
      const newTags = [...tags, tag];
      currentWorkspace.meta.setProperties({
        tags: { options: newTags },
      });
    },
    [currentWorkspace.meta, tags]
  );

  const updateTag = useCallback(
    (tag: Tag) => {
      const newTags = tags.map(t => {
        if (t.id === tag.id) {
          return tag;
        }
        return t;
      });
      currentWorkspace.meta.setProperties({
        tags: { options: newTags },
      });
    },
    [currentWorkspace.meta, tags]
  );

  const deleteTags = useCallback(
    (tagIds: string[]) => {
      const newTags = tags.filter(tag => {
        return !tagIds.includes(tag.id);
      });
      currentWorkspace.meta.setProperties({
        tags: { options: newTags },
      });
    },
    [currentWorkspace.meta, tags]
  );

  return {
    tags,
    tagMetas,
    tagUsageCounts,
    filterPageMetaByTag,
    addNewTag,
    updateTag,
    deleteTags,
  };
}
