import { Entity, LiveData } from '@toeverything/infra';

import type { DocsService } from '../../doc';
import type { TagStore } from '../stores/tag';
import { databaseTagColorToAffineLabel } from './utils';

export class Tag extends Entity<{ id: string }> {
  id = this.props.id;
  constructor(
    private readonly store: TagStore,
    private readonly docs: DocsService
  ) {
    super();
  }

  private readonly tagOption$ = LiveData.from(
    this.store.watchTagInfo(this.id),
    undefined
  ).map(tagInfo => tagInfo);

  value$ = this.tagOption$.map(tag => tag?.value || '');

  color$ = this.tagOption$.map(
    tag => databaseTagColorToAffineLabel(tag?.color ?? '') || ''
  );

  createDate$ = this.tagOption$.map(tag => tag?.createDate || Date.now());

  updateDate$ = this.tagOption$.map(tag => tag?.updateDate || Date.now());

  rename(value: string) {
    this.store.updateTagInfo(this.id, {
      id: this.id,
      value,
      color: this.color$.value,
      createDate: this.createDate$.value,
      updateDate: Date.now(),
    });
  }

  changeColor(color: string) {
    this.store.updateTagInfo(this.id, {
      color,
    });
  }

  tag(pageId: string) {
    const pageRecord = this.docs.list.doc$(pageId).value;
    if (!pageRecord) {
      return;
    }
    pageRecord?.setMeta({
      tags: [...(pageRecord.meta$.value.tags ?? []), this.id],
    });
  }

  untag(pageId: string) {
    const pageRecord = this.docs.list.doc$(pageId).value;
    if (!pageRecord) {
      return;
    }
    pageRecord?.setMeta({
      tags: pageRecord.meta$.value.tags?.filter(tagId => tagId !== this.id),
    });
  }

  readonly pageIds$ = LiveData.from(this.store.watchTagPageIds(this.id), []);
}
