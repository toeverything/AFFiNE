import { Entity, LiveData } from '@toeverything/infra';
import { map } from 'rxjs';

import type { GlobalCache } from '../../storage';
import type { CollapsibleSectionName } from '../types';

const DEFAULT_COLLAPSABLE_STATE: Record<CollapsibleSectionName, boolean> = {
  recent: true,
  favorites: false,
  organize: false,
  collections: true,
  tags: true,
  favoritesOld: true,
  migrationFavorites: true,
  others: false,
};

export class NavigationPanelSection extends Entity<{
  name: CollapsibleSectionName;
}> {
  name: CollapsibleSectionName = this.props.name;
  key = `explorer.section.${this.name}`;
  defaultValue = DEFAULT_COLLAPSABLE_STATE[this.name];

  constructor(private readonly globalCache: GlobalCache) {
    super();
  }

  collapsed$ = LiveData.from(
    this.globalCache
      .watch<boolean>(this.key)
      .pipe(map(v => v ?? this.defaultValue)),
    this.defaultValue
  );

  setCollapsed(collapsed: boolean) {
    this.globalCache.set(this.key, collapsed);
  }
}
