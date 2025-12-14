import {
  menu,
  popMenu,
  popupTargetFromElement,
} from '@blocksuite/affine-components/context-menu';
import { unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import { ArrowDownSmallIcon } from '@blocksuite/icons/lit';
import { CheckBoxCheckSolidIcon, CheckBoxUnIcon } from '@blocksuite/icons/lit';
import { html } from 'lit';

import { t } from '../../logical/type-presets.js';
import { getRange } from '../filter-fn/date.js';
import { createLiteral } from './create.js';
import type { LiteralItemsConfig } from './types.js';

const DIRECTIONS = ['past', 'this', 'next'] as const;
const UNITS = ['day', 'week', 'month', 'year'] as const;

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const allLiteralConfig: LiteralItemsConfig[] = [
  createLiteral({
    type: t.date.instance(),
    getItems: (_type, value, onChange) => {
      const dateValue =
        typeof value.value === 'number' && Number.isFinite(value.value)
          ? value.value
          : Date.now();

      return [
        () => {
          return html` <date-picker
            .padding="${8}"
            .size="${20}"
            .value="${dateValue}"
            .onChange="${(date: Date) => {
              onChange(date.getTime());
            }}"
          ></date-picker>`;
        },
      ];
    },
  }),
  createLiteral({
    type: t.relativeDate.instance(),
    getItems: (_type, value, onChange) => {
      // Get current values or use defaults
      const rawValue = value.value;
      const currentDir: string =
        Array.isArray(rawValue) && typeof rawValue[0] === 'string'
          ? rawValue[0]
          : 'this';
      const currentUnit: string =
        Array.isArray(rawValue) && typeof rawValue[1] === 'string'
          ? rawValue[1]
          : 'day';

      const showDirectionMenu = (e: MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        const target = popupTargetFromElement(e.currentTarget as HTMLElement);
        const handler = popMenu(target, {
          options: {
            items: [
              menu.group({
                items: DIRECTIONS.map(dir =>
                  menu.action({
                    name: capitalize(dir),
                    isSelected: dir === currentDir,
                    select: () => {
                      onChange([dir, currentUnit]);
                    },
                  })
                ),
              }),
            ],
          },
        });
        handler.menu.menuElement.style.minWidth = '100px';
        handler.menu.menuElement.style.width = 'fit-content';
      };

      const showUnitMenu = (e: MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        const target = popupTargetFromElement(e.currentTarget as HTMLElement);
        const handler = popMenu(target, {
          options: {
            items: [
              menu.group({
                items: UNITS.map(unit =>
                  menu.action({
                    name: capitalize(unit),
                    isSelected: unit === currentUnit,
                    select: () => {
                      onChange([currentDir, unit]);
                    },
                  })
                ),
              }),
            ],
          },
        });
        handler.menu.menuElement.style.minWidth = '100px';
        handler.menu.menuElement.style.width = 'fit-content';
      };

      return [
        () => html`
          <div
            style="display: flex; align-items: center; gap: 4px; padding: 8px;"
          >
            <button
              style="
                display: flex;
                align-items: center;
                padding: 4px 8px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
                background: transparent;
                border: 1px solid var(--affine-border-color);
                color: var(--affine-text-primary-color);
              "
              @click=${showDirectionMenu}
            >
              ${capitalize(currentDir)} ${ArrowDownSmallIcon()}
            </button>
            <button
              style="
                display: flex;
                align-items: center;
                padding: 4px 8px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
                background: transparent;
                border: 1px solid var(--affine-border-color);
                color: var(--affine-text-primary-color);
              "
              @click=${showUnitMenu}
            >
              ${capitalize(currentUnit)} ${ArrowDownSmallIcon()}
            </button>
          </div>
        `,
        () => {
          const dir = currentDir as 'past' | 'this' | 'next';
          const unit = currentUnit as 'day' | 'week' | 'month' | 'year';
          const [start, end] = getRange(dir, unit);
          const displayValue =
            dir === 'past' ? end : dir === 'next' ? start : Date.now();
          return html`
            <date-picker
              .padding="${8}"
              .size="${20}"
              .value="${displayValue}"
            ></date-picker>
          `;
        },
      ];
    },
  }),
  createLiteral({
    type: t.boolean.instance(),
    getItems: (_type, _value, _onChange) => {
      return [
        // menu.action({
        //   name: 'Unchecked',
        //   isSelected: !value.value,
        //   select: () => {
        //     onChange(false);
        //     return false;
        //   },
        // }),
        // menu.action({
        //   name: 'Checked',
        //   isSelected: !!value.value,
        //   select: () => {
        //     onChange(true);
        //     return false;
        //   },
        // }),
      ];
    },
  }),
  createLiteral({
    type: t.string.instance(),
    getItems: (_type, value, onChange) => {
      return [
        menu.input({
          initialValue: value.value ?? '',
          onChange: onChange,
          placeholder: 'Type a value...',
        }),
      ];
    },
  }),
  createLiteral({
    type: t.number.instance(),
    getItems: (_type, value, onChange) => {
      return [
        menu.input({
          initialValue: value.value?.toString(10) ?? '',
          placeholder: 'Type a value...',
          onChange: text => {
            const number = Number.parseFloat(text);
            if (Number.isNaN(number)) {
              return;
            }
            onChange(number);
          },
        }),
      ];
    },
  }),
  createLiteral({
    type: t.array.instance(t.tag.instance()),
    getItems: (type, value, onChange) => {
      const set = new Set(value.value);
      return [
        menu.group({
          items:
            type.element.data?.map(tag => {
              const selected = set.has(tag.id);
              const prefix = selected
                ? CheckBoxCheckSolidIcon({ style: `color:#1E96EB` })
                : CheckBoxUnIcon();
              return menu.action({
                name: tag.value,
                prefix,
                label: () =>
                  html`<span
                    style="
             background-color: ${tag.color};
             padding:0 8px;
             border-radius:4px;
             font-size: 14px;
             line-height: 22px;
             border:1px solid ${unsafeCSSVarV2('layer/insideBorder/border')};
"
                    >${tag.value}</span
                  >`,
                select: () => {
                  if (selected) {
                    set.delete(tag.id);
                  } else {
                    set.add(tag.id);
                  }
                  onChange([...set]);
                  return false;
                },
              });
            }) ?? [],
        }),
      ];
    },
  }),
  createLiteral({
    type: t.tag.instance(),
    getItems: (type, value, onChange) => {
      return [
        menu.group({
          items:
            type.data?.map(tag => {
              return menu.action({
                name: tag.value,
                label: () =>
                  html`<span
                    style="
             background-color: ${tag.color};
             padding:0 8px;
             border-radius:4px;
             font-size: 14px;
             line-height: 22px;
             border:1px solid ${unsafeCSSVarV2('layer/insideBorder/border')};
"
                    >${tag.value}</span
                  >`,
                isSelected: value.value === tag.id,
                select: () => {
                  onChange(tag.id);
                  return false;
                },
              });
            }) ?? [],
        }),
      ];
    },
  }),
];
