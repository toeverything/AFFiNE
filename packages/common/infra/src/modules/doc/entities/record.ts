import type { DocMeta } from '@blocksuite/store';

import { Entity } from '../../../framework';
import { LiveData } from '../../../livedata';
import type { DocsStore } from '../stores/docs';

export type DocMode = 'edgeless' | 'page';

/**
 * # DocRecord
 *
 * Some data you can use without open a doc.
 */
export class DocRecord extends Entity<{ id: string }> {
  id: string = this.props.id;
  constructor(private readonly docsStore: DocsStore) {
    super();
  }

  meta$ = LiveData.from<Partial<DocMeta>>(
    this.docsStore.watchDocMeta(this.id),
    {}
  );

  setMeta(meta: Partial<DocMeta>): void {
    this.docsStore.setDocMeta(this.id, meta);
  }

  mode$: LiveData<DocMode> = LiveData.from(
    this.docsStore.watchDocModeSetting(this.id),
    'page'
  ).map(mode => (mode === 'edgeless' ? 'edgeless' : 'page'));

  setMode(mode: DocMode) {
    return this.docsStore.setDocModeSetting(this.id, mode);
  }

  getMode() {
    return this.docsStore.getDocModeSetting(this.id);
  }

  toggleMode() {
    const mode = this.getMode() === 'edgeless' ? 'page' : 'edgeless';
    this.setMode(mode);
    return this.getMode();
  }

  observeMode() {
    return this.docsStore.watchDocModeSetting(this.id);
  }

  moveToTrash() {
    return this.setMeta({ trash: true });
  }

  restoreFromTrash() {
    return this.setMeta({ trash: false });
  }

  title$ = this.meta$.map(meta => meta.title ?? '');

  trash$ = this.meta$.map(meta => meta.trash ?? false);
}
