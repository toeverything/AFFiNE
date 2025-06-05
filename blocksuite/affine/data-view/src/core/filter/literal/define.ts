import { menu, popMenu, popupTargetFromElement, subMenuMiddleware } from '@blocksuite/affine-components/context-menu';
import { ArrowDownSmallIcon, CheckBoxCheckSolidIcon, CheckBoxUnIcon } from '@blocksuite/icons/lit';
import { unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import { html, css } from 'lit';

import { t } from '../../logical/type-presets.js';
import { createLiteral } from './create.js';
import type { LiteralItemsConfig } from './types.js';

import { getRange } from '../filter-fn/date.js';

const DROPDOWN_BUTTON_CSS = css`
  .affine-dropdown-button {
    all: unset;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    padding: 4px 8px;
    border-radius: 4px;
    cursor: pointer;
  }
  .affine-dropdown-button:hover {
    background: var(--affine-hover-color);
  }
  .affine-dropdown-button svg {
    margin-left: 4px;
    width: 12px;
    height: 12px;
  }
`;

const DIRECTIONS = ['past', 'this', 'next'] as const;
const UNITS = ['day', 'week', 'month', 'year'] as const;

export const allLiteralConfig: LiteralItemsConfig[] = [
  createLiteral({
    type: t.relativeDate.instance(),
    getItems: (_type, value, onChange) => {
      const [dir, unit] = value.value ?? ['this', 'day'];
      const [start, end] = getRange(dir, unit);

      return [() => html`
        <style>${DROPDOWN_BUTTON_CSS}</style>
        <div style="padding:8px; display:flex; flex-direction:column; gap:12px;">
          <div style="display:flex; gap:8px;">
            <button class="affine-dropdown-button"
                    @click=${(e: MouseEvent) => {
          e.stopPropagation();
          e.preventDefault();
          const tgt = popupTargetFromElement(e.currentTarget as HTMLElement);
          popMenu(tgt, {
            middleware: subMenuMiddleware,
            options: {
              items: [
                menu.group({
                  items: DIRECTIONS.map(d =>
                    menu.action({
                      name: d[0].toUpperCase() + d.slice(1),
                      isSelected: d === dir,
                      select: () => onChange([d, unit])
                    })
                  )
                })
              ]
            }
          });
        }}>
              ${dir[0].toUpperCase() + dir.slice(1)} ${ArrowDownSmallIcon()}
            </button>

            <button class="affine-dropdown-button"
                    @click=${(e: MouseEvent) => {
          e.stopPropagation();
          e.preventDefault();
          const tgt = popupTargetFromElement(e.currentTarget as HTMLElement);
          popMenu(tgt, {
            middleware: subMenuMiddleware,
            options: {
              items: [
                menu.group({
                  items: UNITS.map(u =>
                    menu.action({
                      name: u[0].toUpperCase() + u.slice(1),
                      isSelected: u === unit,
                      select: () => onChange([dir, u])
                    })
                  )
                })
              ]
            }
          });
        }}>
              ${unit[0].toUpperCase() + unit.slice(1)} ${ArrowDownSmallIcon()}
            </button>
          </div>

          <!-- calendar below -->
          <date-picker
            .padding=${8}
            .direction=${dir}
            .unit=${unit}
            .rangeStart=${start}
            .rangeEnd=${end}
          ></date-picker>
        </div>
      `];
    }
  }),
  createLiteral({
    type: t.date.instance(),
    getItems: (_type, value, onChange) => [
      () => html`
        <date-picker
          .padding=${8}
          .value=${value.value}
          .onChange=${(d: Date) => onChange(d.getTime())}
        ></date-picker>
      `
    ],
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
