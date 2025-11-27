/**
 * @file ID Property Menu Extension
 * @description Extends the property menu system to add ID column settings
 */

import type { MenuConfig } from '@blocksuite/affine-components/context-menu';
import { menu } from '@blocksuite/affine-components/context-menu';

import type { Property } from '../../core/view-manager/property.js';
import { initializeAllIds } from './generator.js';

/**
 * Creates the settings menu item for ID properties
 *
 * @param property - The property to create settings for
 * @returns Menu group configuration with settings submenu
 */
export function createIdSettingsMenu(property: Property) {
  return menu.group({
    items: [
      menu.subMenu({
        name: 'Settings',
        hide: () => property.type$.value !== 'id', // Hide menu if not ID type
        options: {
          title: {
            text: 'ID Column Settings',
          },
          // Create dynamic menu items that read current values when the submenu is rendered
          items: createDynamicIdConfigMenuItems(property),
        },
      }),
    ],
  });
}

export function createDynamicIdConfigMenuItems(
  property: Property
): MenuConfig[] {
  return [
    // Dynamic prefix input - reads current value when menu is rendered
    (menuInstance: any, _index: number) => {
      const currentData = property.data$.value;
      const currentPrefix = String(currentData.prefix ?? '');
      const inputMenuConfig = menu.input({
        placeholder: 'Prefix (e.g., TASK-)',
        initialValue: currentPrefix,
        onComplete: (value: string) => {
          property.dataUpdate(() => ({ prefix: value }));
        },
        onChange: (value: string) => {
          property.dataUpdate(() => ({ prefix: value }));
        },
      });
      return inputMenuConfig(menuInstance);
    },
    // Dynamic suffix input - reads current value when menu is rendered
    (menuInstance: any, _index: number) => {
      const currentData = property.data$.value;
      const currentSuffix = String(currentData.suffix ?? '');
      const inputMenuConfig = menu.input({
        placeholder: 'Suffix (e.g., -2025)',
        initialValue: currentSuffix,
        onComplete: (value: string) => {
          property.dataUpdate(() => ({ suffix: value }));
        },
        onChange: (value: string) => {
          property.dataUpdate(() => ({ suffix: value }));
        },
      });
      return inputMenuConfig(menuInstance);
    },
    // Dynamic padding submenu - reads current value when menu is rendered
    (menuInstance: any, _index: number) => {
      const currentData = property.data$.value;
      const currentPadding = currentData.padding ?? 3;
      const subMenuConfig = menu.subMenu({
        name: 'Padding',
        options: {
          title: {
            text: 'ID Padding',
          },
          items: [
            menu.group({
              items: [
                menu.action({
                  name: '1 (e.g., 1, 2, 3...)',
                  isSelected: currentPadding === 1,
                  select: () => {
                    property.dataUpdate(() => ({ padding: 1 }));
                  },
                }),
                menu.action({
                  name: '2 (e.g., 01, 02, 03...)',
                  isSelected: currentPadding === 2,
                  select: () => {
                    property.dataUpdate(() => ({ padding: 2 }));
                  },
                }),
                menu.action({
                  name: '3 (e.g., 001, 002, 003...)',
                  isSelected: currentPadding === 3,
                  select: () => {
                    property.dataUpdate(() => ({ padding: 3 }));
                  },
                }),
                menu.action({
                  name: '4 (e.g., 0001, 0002, 0003...)',
                  isSelected: currentPadding === 4,
                  select: () => {
                    property.dataUpdate(() => ({ padding: 4 }));
                  },
                }),
                menu.action({
                  name: '5 (e.g., 00001, 00002, 00003...)',
                  isSelected: currentPadding === 5,
                  select: () => {
                    property.dataUpdate(() => ({ padding: 5 }));
                  },
                }),
              ],
            }),
          ],
        },
      });
      return subMenuConfig(menuInstance);
    },
    // Dynamic regenerate button
    (menuInstance: any, _index: number) => {
      const actionMenuConfig = menu.action({
        name: 'Re-generate all IDs',
        select: () => {
          initializeAllIds(property);
        },
      });
      return actionMenuConfig(menuInstance);
    },
  ];
}

/**
 * Extends the base property menu with ID-specific settings
 *
 * @param baseMenuItems - The existing menu groups
 * @param property - The property being configured
 * @returns The extended menu items
 */
export function extendPropertyMenuWithIdSettings(
  baseMenuItems: ReturnType<typeof menu.group>[],
  property: Property
): ReturnType<typeof menu.group>[] {
  // Find the position after the Type menu to insert our Settings menu
  const typeMenuIndex = baseMenuItems.findIndex(menuGroup => {
    // Cast the menu group to access its properties safely
    const group = menuGroup as unknown as { items?: unknown[] };
    if (!group.items || !Array.isArray(group.items)) return false;

    // Search for the Type submenu
    return group.items.some(subItem => {
      // Cast subItem to access its properties safely
      const item = subItem as unknown as { type?: string; name?: string };
      return item.type === 'subMenu' && item.name === 'Type';
    });
  });

  // If found, insert the settings menu after it
  if (typeMenuIndex !== -1) {
    const settingsMenu = createIdSettingsMenu(property);
    // Insert after type menu
    baseMenuItems.splice(typeMenuIndex + 1, 0, settingsMenu);
  } else {
    // If type menu not found, just add to the end
    baseMenuItems.push(createIdSettingsMenu(property));
  }

  return baseMenuItems;
}
