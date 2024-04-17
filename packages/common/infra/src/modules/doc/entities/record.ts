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
  meta: Partial<DocMeta> | null = null;
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
    this.docsStore.setDocModeSetting(this.id, mode);
  }

  toggleMode() {
    this.setMode(this.mode$.value === 'edgeless' ? 'page' : 'edgeless');
    return this.mode$.value;
  }

  title$ = this.meta$.map(meta => meta.title ?? '');
}
