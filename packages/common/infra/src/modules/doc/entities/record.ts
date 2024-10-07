import type { DocMode } from '@blocksuite/affine/blocks';
import type { DocMeta } from '@blocksuite/affine/store';

import { Entity } from '../../../framework';
import { LiveData } from '../../../livedata';
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

  setProperties(properties: Partial<DocProperties>): void {
    this.docPropertiesStore.updateDocProperties(this.id, properties);
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
}
