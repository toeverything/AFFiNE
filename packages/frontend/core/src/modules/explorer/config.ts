import type { CollapsibleSectionName } from './types';

/**
 *
 * This is the key prefix that local storage uses to store the collapsed state of a note.
 *
 * example key: 'explorer:section:organize:folder:111:tag:222:doc:333:doc:444
 */
export const EXPLORER_KEY: Record<CollapsibleSectionName, string> = {
  recent: 'explorer:section:recent',
  favorites: 'explorer:section:favorites',
  organize: 'explorer:section:organize',
  collections: 'explorer:section:collections',
  tags: 'explorer:section:tags',
  favoritesOld: 'explorer:section:favoritesOld',
  migrationFavorites: 'explorer:section:migrationFavorites',
};
