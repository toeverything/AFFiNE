import type { DocMode } from '@blocksuite/affine/model';
import { Entity, LiveData, MemoryMemento } from '@toeverything/infra';

export class GlobalContext extends Entity {
  memento = new MemoryMemento();

  workspaceId = this.define<string>('workspaceId');
  workspaceFlavour = this.define<string>('workspaceFlavour');

  serverId = this.define<string>('serverId', 'affine-cloud');

  /**
   * is in doc page
   */
  isDoc = this.define<boolean>('isDoc');
  isTrashDoc = this.define<boolean>('isTrashDoc');
  docId = this.define<string>('docId');
  docMode = this.define<DocMode>('docMode');

  /**
   * is in collection page
   */
  isCollection = this.define<boolean>('isCollection');
  collectionId = this.define<string>('collectionId');

  /**
   * is in trash page
   */
  isTrash = this.define<boolean>('isTrash');

  /**
   * is in tag page
   */
  isTag = this.define<boolean>('isTag');
  tagId = this.define<string>('tagId');

  /**
   * is in all docs page
   */
  isAllDocs = this.define<boolean>('isAllDocs');

  define<T>(key: string, defaultValue: T | null = null) {
    this.memento.set(key, defaultValue);
    const livedata$ = LiveData.from(this.memento.watch<T>(key), defaultValue);
    return {
      get: () => this.memento.get(key) as T | null,
      set: (value: T | null) => {
        this.memento.set(key, value);
      },
      $: livedata$,
    };
  }
}
