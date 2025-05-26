import { menu } from '@blocksuite/affine-components/context-menu';
import { IS_MOBILE } from '@blocksuite/global/env';
import { html } from 'lit/static-html.js';

import { initializeAllIds } from '../../property-presets/id/generator.js';
import { extendPropertyMenuWithIdSettings } from '../../property-presets/id/property-menu-extension.js';
import { renderUniLit } from '../utils/uni-component/index.js';
import type { Property } from '../view-manager/property.js';

/**
 * Checks if there's already an ID column in the database
 * @param property - The property to check the dataSource from
 * @returns true if an ID column exists, false otherwise
 */
const hasExistingIdColumn = (property: Property): boolean => {
  const dataSource = property.view.manager.dataSource;
  const properties = dataSource.properties$.value || [];

  // Check if any existing property has type 'id'
  return properties.some(propertyId => {
    const propertyType = dataSource.propertyTypeGet(propertyId);
    return propertyType === 'id';
  });
};

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

  // Check if there's already an ID column and if the current property is not already an ID
  const idColumnExists = hasExistingIdColumn(property);
  const currentPropertyIsId = property.type$.value === 'id';

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
                const isIdType = config.type === 'id';
                const shouldDisableId =
                  isIdType && idColumnExists && !currentPropertyIsId;
                return menu.action({
                  name: config.config.name,
                  prefix: renderUniLit(config.renderer.icon),
                  isSelected: property.type$.value === config.type,
                  class: shouldDisableId
                    ? { 'affine-menu-action-disabled': true }
                    : {},
                  select() {
                    if (shouldDisableId) return; // Désactive la sélection si déjà une colonne ID
                    if (property.type$.value === config.type) return;
                    if (property.typeSet) {
                      property.typeSet(config.type);
                      // Si on passe sur le type ID, on force la numérotation de tous les éléments
                      if (config.type === 'id') {
                        // Import statique pour garantir l'exécution
                        initializeAllIds(property);
                      }
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
