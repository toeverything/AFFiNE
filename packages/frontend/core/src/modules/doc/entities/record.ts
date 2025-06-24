import type { DocMode } from '@blocksuite/affine/model';
import type { DocMeta } from '@blocksuite/affine/store';
import { Entity, LiveData } from '@toeverything/infra';

import type { DocProperties } from '../../db';
import type { DocPropertiesStore } from '../stores/doc-properties';
import type { DocsStore } from '../stores/docs';

/**
 * # DocRecord
 *
 * Some data you can use without open a doc.
 */
export class DocRecord extends Entity<{ id: string }> {
  id: string = this.props.id;
  constructor(
    private readonly docsStore: DocsStore,
    private readonly docPropertiesStore: DocPropertiesStore
  ) {
    super();
  }

  meta$ = LiveData.from<Partial<DocMeta>>(
    this.docsStore.watchDocMeta(this.id),
    {}
  );

  properties$ = LiveData.from<DocProperties>(
    this.docPropertiesStore.watchDocProperties(this.id),
    { id: this.id }
  );

  property$(propertyId: string) {
    return this.properties$.selector(p => p[propertyId]) as LiveData<
      string | undefined | null
    >;
  }

  customProperty$(propertyId: string) {
    return this.properties$.selector(
      p => p['custom:' + propertyId]
    ) as LiveData<string | undefined | null>;
  }

  setCustomProperty(propertyId: string, value: string) {
    this.docPropertiesStore.updateDocProperties(this.id, {
      ['custom:' + propertyId]: value,
    });
  }

  getProperties() {
    return this.docPropertiesStore.getDocProperties(this.id);
  }

  updateProperties(properties: Partial<DocProperties>) {
    this.docPropertiesStore.updateDocProperties(this.id, properties);
  }

  setProperty<Key extends keyof DocProperties>(
    propertyId: Key,
    value: DocProperties[Key]
  ) {
    this.docPropertiesStore.updateDocProperties(this.id, {
      [propertyId]: value,
    });
  }

  setMeta(meta: Partial<DocMeta>): void {
    this.docsStore.setDocMeta(this.id, meta);
  }

  primaryMode$: LiveData<DocMode> = LiveData.from(
    this.docsStore.watchDocPrimaryModeSetting(this.id),
    'page' as DocMode
  ).map(mode => (mode === 'edgeless' ? 'edgeless' : 'page') as DocMode);

  setPrimaryMode(mode: DocMode) {
    return this.docsStore.setDocPrimaryModeSetting(this.id, mode);
  }

  getPrimaryMode() {
    return this.docsStore.getDocPrimaryModeSetting(this.id);
  }

  moveToTrash() {
    return this.setMeta({ trash: true, trashDate: Date.now() });
  }

  restoreFromTrash() {
    return this.setMeta({ trash: false, trashDate: undefined });
  }

  title$ = this.meta$.map(meta => meta.title ?? '');

  trash$ = this.meta$.map(meta => meta.trash ?? false);

  createdAt$ = this.meta$.map(meta => meta.createDate);

  updatedAt$ = this.meta$.map(meta => meta.updatedDate);

  createdBy$ = this.property$('createdBy');

  updatedBy$ = this.property$('updatedBy');

  setCreatedAt(createdAt: number) {
    this.setMeta({ createDate: createdAt });
  }

  setUpdatedAt(updatedAt: number) {
    this.setMeta({ updatedDate: updatedAt });
  }

  setCreatedBy(createdBy: string) {
    this.setProperty('createdBy', createdBy);
  }

  setUpdatedBy(updatedBy: string) {
    this.setProperty('updatedBy', updatedBy);
  }
}
