import { Entity, LiveData } from '@toeverything/infra';

import type { DocsService } from '../../doc';
import { Tag } from '../entities/tag';
import type { TagStore } from '../stores/tag';

export class TagList extends Entity {
  constructor(
    private readonly store: TagStore,
    private readonly docs: DocsService
  ) {
    super();
  }

  private readonly pool = new Map<string, Tag>();

  readonly tags$ = LiveData.from(this.store.watchTagIds(), []).map(ids => {
    return ids.map(id => {
      const exists = this.pool.get(id);
      if (exists) {
        return exists;
      }
      const record = this.framework.createEntity(Tag, { id });
      this.pool.set(id, record);
      return record;
    });
  });

  createTag(value: string, color: string) {
    const newId = this.store.createNewTag(value, color);
    const newTag = this.framework.createEntity(Tag, { id: newId });
    return newTag;
  }

  deleteTag(tagId: string) {
    this.store.deleteTag(tagId);
  }

  tagsByPageId$(pageId: string) {
    return LiveData.computed(get => {
      const docRecord = get(this.docs.list.doc$(pageId));
      if (!docRecord) return [];
      const tagIds = get(docRecord.meta$).tags;

      return get(this.tags$).filter(tag => (tagIds ?? []).includes(tag.id));
    });
  }

  tagIdsByPageId$(pageId: string) {
    return this.tagsByPageId$(pageId).map(tags => tags.map(tag => tag.id));
  }

  tagByTagId$(tagId?: string) {
    return this.tags$.map(tags => tags.find(tag => tag.id === tagId));
  }

  tagMetas$ = LiveData.computed(get => {
    return get(this.tags$).map(tag => {
      return {
        id: tag.id,
        name: get(tag.value$),
        color: get(tag.color$),
        createDate: get(tag.createDate$),
        updatedDate: get(tag.updateDate$),
      };
    });
  });

  private filterFn(value: string, query?: string) {
    const trimmedQuery = query?.trim().toLowerCase() ?? '';
    const trimmedValue = value.trim().toLowerCase();
    return trimmedValue.includes(trimmedQuery);
  }

  filterTagsByName$(name: string) {
    return LiveData.computed(get => {
      return get(this.tags$).filter(tag =>
        this.filterFn(get(tag.value$), name)
      );
    });
  }
}
