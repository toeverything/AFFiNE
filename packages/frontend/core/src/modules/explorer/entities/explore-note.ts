import type { GlobalCache } from '@toeverything/infra';
import { Entity, LiveData } from '@toeverything/infra';
import { map } from 'rxjs';

export class NoteExplorer extends Entity {
  constructor(private readonly globalCache: GlobalCache) {
    super();
  }

  collapsed$(key: string) {
    return LiveData.from(
      this.globalCache.watch<boolean>(key).pipe(map(v => v ?? true)),
      true
    );
  }

  setCollapsed(key: string, collapsed: boolean) {
    this.globalCache.set(key, collapsed);
  }
}
