import { menu } from '@blocksuite/affine-components/context-menu';
import { unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import { CheckBoxCheckSolidIcon, CheckBoxUnIcon } from '@blocksuite/icons/lit';
import { html } from 'lit';

import { t } from '../../logical/type-presets.js';
import { createLiteral } from './create.js';
import type { LiteralItemsConfig } from './types.js';

export const allLiteralConfig: LiteralItemsConfig[] = [
  createLiteral({
    type: t.date.instance(),
    getItems: (_type, value, onChange) => {
      return [
        () => {
          return html` <date-picker
            .padding="${8}"
            .size="${20}"
            .value="${value.value}"
            .onChange="${(date: Date) => {
              onChange(date.getTime());
            }}"
          ></date-picker>`;
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
