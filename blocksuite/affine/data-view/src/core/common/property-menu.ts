import { menu } from '@blocksuite/affine-components/context-menu';
import { IS_MOBILE } from '@blocksuite/global/env';
import { html } from 'lit/static-html.js';

import { extendPropertyMenuWithIdSettings } from '../../property-presets/id/property-menu-extension.js';
import { renderUniLit } from '../utils/uni-component/index.js';
import type { Property } from '../view-manager/property.js';

export const inputConfig = (property: Property) => {
  if (IS_MOBILE) {
    return menu.input({
      prefix: html`
        <div class="affine-database-column-type-menu-icon">
          ${renderUniLit(property.icon)}
        </div>
      `,
      initialValue: property.name$.value,
      placeholder: 'Property name',
      onChange: text => {
        property.nameSet(text);
      },
    });
  }

  return menu.group({
    items: [
      menu.input({
        placeholder: 'Property name',
        initialValue: property.name$.value,
        onComplete: text => {
          property.nameSet(text);
        },
      }),
    ],
  });
};

export const typeConfig = (property: Property) => {
  const dataSource = property.view.manager.dataSource;
  // Get available property types from propertyMetas$
  const propertyMetas = dataSource.propertyMetas$.value || [];

  return menu.group({
    items: [
      menu.subMenu({
        name: 'Type',
        options: {
          title: {
            text: 'Property Type',
          },
          items: [
            menu.group({
              items: propertyMetas.map(config => {
                return menu.action({
                  name: config.config.name,
                  prefix: renderUniLit(config.renderer.icon),
                  isSelected: property.type$.value === config.type,
                  select() {
                    if (property.type$.value === config.type) return;
                    if (property.typeSet) {
                      property.typeSet(config.type);
                    }
                  },
                });
              }),
            }),
          ],
        },
      }),
    ],
  });
};

/**
 * Creates a complete property configuration menu
 * Supports common property types and includes special settings for ID properties
 *
 * @param property - The property to configure
 * @returns An array of menu items
 */
export const createPropertyMenu = (property: Property) => {
  // Start with basic property menu items
  const baseMenuItems = [inputConfig(property), typeConfig(property)];

  // Extend with ID-specific settings if needed
  try {
    return extendPropertyMenuWithIdSettings(baseMenuItems, property);
  } catch (e) {
    // If the extension fails, just return the base menu items
    console.error('Failed to extend property menu:', e);
    return baseMenuItems;
  }
};
