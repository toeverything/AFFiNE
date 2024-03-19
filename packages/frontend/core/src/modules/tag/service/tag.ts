import { LiveData, type PageRecordList } from '@toeverything/infra';
import { nanoid } from 'nanoid';

import type { WorkspaceLegacyProperties } from '../../workspace';
import { Tag } from '../entities/tag';

export class TagService {
  constructor(
    private readonly properties: WorkspaceLegacyProperties,
    private readonly pageRecordList: PageRecordList
  ) {}

  readonly tags = this.properties.tagOptions$.map(tags =>
    tags.map(tag => new Tag(tag.id, this.properties, this.pageRecordList))
  );

  createTag(value: string, color: string) {
    const newId = nanoid();
    this.properties.updateTagOptions([
      ...this.properties.tagOptions$.value,
      {
        id: newId,
        value,
        color,
        createDate: Date.now(),
        updateDate: Date.now(),
      },
    ]);
    const newTag = new Tag(newId, this.properties, this.pageRecordList);
    return newTag;
  }

  deleteTag(tagId: string) {
    this.properties.removeTagOption(tagId);
  }

  tagsByPageId(pageId: string) {
    return LiveData.computed(get => {
      const pageRecord = get(this.pageRecordList.record(pageId));
      if (!pageRecord) return [];
      const tagIds = get(pageRecord.meta).tags;

      return get(this.tags).filter(tag => tagIds.includes(tag.id));
    });
  }

  tagIdsByPageId(pageId: string) {
    return this.tagsByPageId(pageId).map(tags => tags.map(tag => tag.id));
  }

  tagByTagId(tagId?: string) {
    return this.tags.map(tags => tags.find(tag => tag.id === tagId));
  }

  tagMetas = LiveData.computed(get => {
    return get(this.tags).map(tag => {
      return {
        id: tag.id,
        title: get(tag.value),
        color: get(tag.color),
        pageCount: get(tag.pageIds).length,
        createDate: get(tag.createDate),
        updatedDate: get(tag.updateDate),
      };
    });
  });

  private filterFn(value: string, query?: string) {
    const trimmedQuery = query?.trim().toLowerCase() ?? '';
    const trimmedValue = value.trim().toLowerCase();
    return trimmedValue.includes(trimmedQuery);
  }

  filterTagsByName(name: string) {
    return LiveData.computed(get => {
      return get(this.tags).filter(tag => this.filterFn(get(tag.value), name));
    });
  }

  tagByTagValue(value: string) {
    return LiveData.computed(get => {
      return get(this.tags).find(tag => this.filterFn(get(tag.value), value));
    });
  }
}
