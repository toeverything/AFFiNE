import {
  menu,
  popupTargetFromElement,
} from '@blocksuite/affine-components/context-menu';
import { MathPanelIcon } from '@blocksuite/icons/lit';
import { html } from 'lit/static-html.js';

import { FORMULA_PROPERTY_TYPE } from '../../property-presets/formula/cell-value.js';
import { popFormulaEditor } from '../../property-presets/formula/editor.js';
import { renderUniLit } from '../utils/uni-component/index.js';
import type { Property } from '../view-manager/property.js';

export const inputConfig = (property: Property) => {
  return menu.input({
    prefix: html`
      <div class="affine-database-column-type-menu-icon">
        ${renderUniLit(property.icon)}
      </div>
    `,
    initialValue: property.name$.value,
    placeholder: 'Property name',
    onBlur: text => {
      property.nameSet(text);
    },
  });
};
export const typeConfig = (property: Property) => {
  return menu.group({
    items: [
      menu.subMenu({
        name: 'Type',
        hide: () => !property.typeCanSet,
        postfix: html` <div
          class="affine-database-column-type-icon"
          style="color: var(--affine-text-secondary-color);gap:4px;font-size: 14px;"
        >
          ${renderUniLit(property.icon)}
          ${
            property.view.propertyMetas$.value.find(
              v => v.type === property.type$.value
            )?.config.name
          }
        </div>`,
        options: {
          title: {
            text: 'Property type',
          },
          items: [
            menu.group({
              items: property.view.propertyMetas$.value.map(config => {
                return menu.action({
                  isSelected: config.type === property.type$.value,
                  name: config.config.name,
                  prefix: renderUniLit(config.renderer.icon),
                  select: ele => {
                    if (property.type$.value === config.type) {
                      return;
                    }
                    property.typeSet?.(config.type);
                    afterPropertyTypeChange(property, config.type, ele);
                  },
                });
              }),
            }),
          ],
        },
      }),
      formulaConfig(property),
    ],
  });
};

/**
 * Opens the formula editor right after a property is switched to a formula,
 * so the new column doesn't stay empty.
 */
export const afterPropertyTypeChange = (
  property: Property,
  type: string,
  anchor: HTMLElement
) => {
  if (type === FORMULA_PROPERTY_TYPE) {
    popFormulaEditor(popupTargetFromElement(anchor), property);
  }
};

export const formulaConfig = (property: Property) => {
  return menu.action({
    name: 'Edit formula',
    prefix: MathPanelIcon(),
    hide: () =>
      property.type$.value !== FORMULA_PROPERTY_TYPE ||
      property.view.readonly$.value,
    select: ele => {
      popFormulaEditor(popupTargetFromElement(ele), property);
    },
  });
};
