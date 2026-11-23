import { LiveData, Service } from '@toeverything/infra';

import type { GlobalCache } from '../../storage/providers/global';
import type { WorkspaceService } from '../../workspace';

const DEFAULT_COLLAPSABLE_STATE: Record<string, boolean> = {
  recent: true,
  favorites: false,
  organize: false,
  collections: true,
  tags: true,
  favoritesOld: true,
  migrationFavorites: true,
  others: false,
};

export class NavigationPanelService extends Service {
  constructor(
    private readonly globalCache: GlobalCache,
    private readonly workspaceService: WorkspaceService
  ) {
    super();
  }

  private readonly collapsedCache = new Map<string, LiveData<boolean>>();

  collapsed$(path: string[]) {
    const pathKey = path.join(':');
    const key = `navigation:${this.workspaceService.workspace.id}:${pathKey}`;
    const cached$ = this.collapsedCache.get(key);
    if (!cached$) {
      const liveData$ = LiveData.from(
        this.globalCache.watch<boolean>(key),
        undefined
      ).map(v => v ?? DEFAULT_COLLAPSABLE_STATE[pathKey] ?? true);
      this.collapsedCache.set(key, liveData$);
      return liveData$;
    }
    return cached$;
  }

  setCollapsed(path: string[], collapsed: boolean) {
    const pathKey = path.join(':');
    const key = `navigation:${this.workspaceService.workspace.id}:${pathKey}`;
    this.globalCache.set(key, collapsed);
  }
}
