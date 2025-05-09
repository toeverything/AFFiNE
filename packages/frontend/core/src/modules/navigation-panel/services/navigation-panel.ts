import { Service } from '@toeverything/infra';

import { NavigationPanelSection } from '../entities/navigation-panel-section';
import type { CollapsibleSectionName } from '../types';

const allSectionName: Array<CollapsibleSectionName> = [
  'recent', // mobile only
  'favorites',
  'organize',
  'collections',
  'tags',
  'favoritesOld',
  'migrationFavorites',
  'others',
];

export class NavigationPanelService extends Service {
  readonly sections = allSectionName.reduce(
    (prev, name) =>
      Object.assign(prev, {
        [name]: this.framework.createEntity(NavigationPanelSection, { name }),
      }),
    {} as Record<CollapsibleSectionName, NavigationPanelSection>
  );
}
