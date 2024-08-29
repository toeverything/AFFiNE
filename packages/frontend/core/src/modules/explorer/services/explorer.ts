import { Service } from '@toeverything/infra';

import { ExplorerSection } from '../entities/explore-section';
import type { CollapsibleSectionName } from '../types';

const allSectionName: Array<CollapsibleSectionName> = [
  'recent', // mobile only
  'favorites',
  'organize',
  'collections',
  'tags',
  'favoritesOld',
  'migrationFavorites',
];

export class ExplorerService extends Service {
  readonly sections = allSectionName.reduce(
    (prev, name) =>
      Object.assign(prev, {
        [name]: this.framework.createEntity(ExplorerSection, { name }),
      }),
    {} as Record<CollapsibleSectionName, ExplorerSection>
  );
}
