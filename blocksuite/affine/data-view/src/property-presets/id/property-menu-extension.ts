/**
 * @file ID Property Menu Extension
 * @description Extends the property menu system to add ID column settings
 */

import { menu } from '@blocksuite/affine-components/context-menu';

import type { Property } from '../../core/view-manager/property.js';
import { idPropertyConfigMenuItems } from './config-menu.js';

/**
 * Creates the settings menu item for ID properties
 *
 * @param property - The property to create settings for
 * @returns Menu group configuration with settings submenu
 */
export function createIdSettingsMenu(property: Property) {
  // Check if this property is of type ID
  const isIdType = property.type$.value === 'id';

  return menu.group({
    items: [
      menu.subMenu({
        name: 'Settings',
        hide: !isIdType ? () => true : undefined, // Hide menu if not ID type
        options: {
          title: {
            text: 'ID Column Settings',
          },
          // Pass a static array of menu configs as required by MenuOptions
          items: isIdType ? idPropertyConfigMenuItems(property) : [],
        },
      }),
    ],
  });
}

/**
 * Type definition for menu items to avoid TypeScript errors
 */
interface MenuGroupItem {
  type: string;
  items?: MenuGroupItem[];
  name?: string;
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
      const item = subItem as unknown as MenuGroupItem;
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
