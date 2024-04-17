import type { Tag as TagSchema } from '@affine/env/filter';
import { Store } from '@toeverything/infra';
import { nanoid } from 'nanoid';

import type { WorkspaceLegacyProperties } from '../../properties';

export class TagStore extends Store {
  constructor(private readonly properties: WorkspaceLegacyProperties) {
    super();
  }

  watchTagIds() {
    return this.properties.tagOptions$
      .map(tags => tags.map(tag => tag.id))
      .asObservable();
  }

  createNewTag(value: string, color: string) {
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
    return newId;
  }

  deleteTag(id: string) {
    this.properties.removeTagOption(id);
  }

  watchTagInfo(id: string) {
    return this.properties.tagOptions$.map(
      tags => tags.find(tag => tag.id === id) as TagSchema | undefined
    );
  }

  updateTagInfo(id: string, tagInfo: Partial<TagSchema>) {
    const tag = this.properties.tagOptions$.value.find(tag => tag.id === id) as
      | TagSchema
      | undefined;
    if (!tag) {
      return;
    }
    this.properties.updateTagOption(id, {
      id: id,
      value: tag.value,
      color: tag.color,
      createDate: tag.createDate,
      updateDate: Date.now(),
      ...tagInfo,
    });
  }
}
