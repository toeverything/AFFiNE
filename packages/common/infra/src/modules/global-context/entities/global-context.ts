import { Entity } from '../../../framework';
import { LiveData } from '../../../livedata';
import { MemoryMemento } from '../../../storage';
import type { DocMode } from '../../doc';

export class GlobalContext extends Entity {
  memento = new MemoryMemento();

  workspaceId = this.define<string>('workspaceId');

  docId = this.define<string>('docId');

  docMode = this.define<DocMode>('docMode');

  define<T>(key: string) {
    this.memento.set(key, null);
    const livedata$ = LiveData.from(this.memento.watch<T>(key), null);
    return {
      get: () => this.memento.get(key) as T | null,
      set: (value: T | null) => this.memento.set(key, value),
      $: livedata$,
    };
  }
}
