import { Entity } from '../../../framework';
import { LiveData } from '../../../livedata';
import { MemoryMemento } from '../../../storage';
import type { DocMode } from '../../doc';

export class GlobalContext extends Entity {
  memento = new MemoryMemento();

  workspaceId = this.define<string>('workspaceId');

  isDoc = this.define<boolean>('isDoc');
  docId = this.define<string>('docId');

  isCollection = this.define<boolean>('isCollection');
  collectionId = this.define<string>('collectionId');

  isTrash = this.define<boolean>('isTrash');

  docMode = this.define<DocMode>('docMode');

  isTag = this.define<boolean>('isTag');
  tagId = this.define<string>('tagId');

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
