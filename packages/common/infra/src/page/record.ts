import type { DocMeta } from '@blocksuite/store';
import { Observable } from 'rxjs';

import { LiveData } from '../livedata';
import type { Workspace, WorkspaceLocalState } from '../workspace';

export type PageMode = 'edgeless' | 'page';

export class PageRecord {
  constructor(
    public readonly id: string,
    private readonly workspace: Workspace,
    private readonly localState: WorkspaceLocalState
  ) {}

  meta = LiveData.from<DocMeta>(
    new Observable(subscriber => {
      const emit = () => {
        const meta = this.workspace.docCollection.meta.docMetas.find(
          page => page.id === this.id
        );
        if (meta === undefined) {
          return;
        }
        subscriber.next(meta);
      };

      emit();

      const dispose =
        this.workspace.docCollection.meta.docMetaUpdated.on(emit).dispose;
      return () => {
        dispose();
      };
    }),
    {
      id: this.id,
      title: '',
      tags: [],
      createDate: 0,
    }
  );

  setMeta(meta: Partial<DocMeta>): void {
    this.workspace.docCollection.setDocMeta(this.id, meta);
  }

  mode: LiveData<PageMode> = LiveData.from(
    this.localState.watch<PageMode>(`page:${this.id}:mode`),
    'page'
  ).map(mode => (mode === 'edgeless' ? 'edgeless' : 'page'));

  setMode(mode: PageMode) {
    this.localState.set(`page:${this.id}:mode`, mode);
  }

  toggleMode() {
    this.setMode(this.mode.value === 'edgeless' ? 'page' : 'edgeless');
    return this.mode.value;
  }

  title = this.meta.map(meta => meta.title);
}
