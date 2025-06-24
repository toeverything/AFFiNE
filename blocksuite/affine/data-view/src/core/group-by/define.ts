import hash from '@emotion/hash';

import type { TypeInstance } from '../logical/type.js';
import { t } from '../logical/type-presets.js';
import { createUniComponentFromWebComponent } from '../utils/uni-component/uni-component.js';
import { BooleanGroupView } from './renderer/boolean-group.js';
import { NumberGroupView } from './renderer/number-group.js';
import { SelectGroupView } from './renderer/select-group.js';
import { StringGroupView } from './renderer/string-group.js';
import type { GroupByConfig } from './types.js';

export const createGroupByConfig = <
  Data extends Record<string, unknown>,
  MatchType extends TypeInstance,
  GroupValue = unknown,
>(
  config: GroupByConfig<Data, MatchType, GroupValue>
): GroupByConfig => {
  return config as never as GroupByConfig;
};
export const ungroups = {
  key: 'Ungroups',
  value: null,
};
export const groupByMatchers = [
  createGroupByConfig({
    name: 'select',
    matchType: t.tag.instance(),
    groupName: (type, value: string | null) => {
      if (t.tag.is(type) && type.data) {
        return type.data.find(v => v.id === value)?.value ?? '';
      }
      return '';
    },
    defaultKeys: type => {
      if (t.tag.is(type) && type.data) {
        return [
          ungroups,
          ...type.data.map(v => ({
            key: v.id,
            value: v.id,
          })),
        ];
      }
      return [ungroups];
    },
    valuesGroup: (value, _type) => {
      if (value == null) {
        return [ungroups];
      }
      return [
        {
          key: `${value}`,
          value: value.toString(),
        },
      ];
    },
    addToGroup: v => v,
    view: createUniComponentFromWebComponent(SelectGroupView),
  }),
  createGroupByConfig({
    name: 'multi-select',
    matchType: t.array.instance(t.tag.instance()),
    groupName: (type, value: string | null) => {
      if (t.array.is(type) && t.tag.is(type.element) && type.element.data) {
        return type.element.data.find(v => v.id === value)?.value ?? '';
      }
      return '';
    },
    defaultKeys: type => {
      if (t.array.is(type) && t.tag.is(type.element) && type.element.data) {
        return [
          ungroups,
          ...type.element.data.map(v => ({
            key: v.id,
            value: v.id,
          })),
        ];
      }
      return [ungroups];
    },
    valuesGroup: (value, _type) => {
      if (value == null) {
        return [ungroups];
      }
      if (Array.isArray(value) && value.length) {
        return value.map(id => ({
          key: `${id}`,
          value: id,
        }));
      }
      return [ungroups];
    },
    addToGroup: (value, old) => {
      if (value == null) {
        return old;
      }
      return Array.isArray(old) ? [...old, value] : [value];
    },
    removeFromGroup: (value, old) => {
      if (Array.isArray(old)) {
        return old.filter(v => v !== value);
      }
      return old;
    },
    view: createUniComponentFromWebComponent(SelectGroupView),
  }),
  createGroupByConfig({
    name: 'text',
    matchType: t.string.instance(),
    groupName: (_type, value: string | null) => {
      return `${value ?? ''}`;
    },
    defaultKeys: _type => {
      return [ungroups];
    },
    valuesGroup: (value, _type) => {
      if (typeof value !== 'string' || !value) {
        return [ungroups];
      }
      return [
        {
          key: hash(value),
          value,
        },
      ];
    },
    addToGroup: v => v,
    view: createUniComponentFromWebComponent(StringGroupView),
  }),
  createGroupByConfig({
    name: 'number',
    matchType: t.number.instance(),
    groupName: (_type, value: number | null) => {
      return `${value ?? ''}`;
    },
    defaultKeys: _type => {
      return [ungroups];
    },
    valuesGroup: (value: number | null, _type) => {
      if (typeof value !== 'number') {
        return [ungroups];
      }
      return [
        {
          key: `g:${Math.floor(value / 10)}`,
          value: Math.floor(value / 10),
        },
      ];
    },
    addToGroup: value => (typeof value === 'number' ? value * 10 : null),
    view: createUniComponentFromWebComponent(NumberGroupView),
  }),
  createGroupByConfig({
    name: 'boolean',
    matchType: t.boolean.instance(),
    groupName: (_type, value: boolean | null) => {
      return `${value?.toString() ?? ''}`;
    },
    defaultKeys: _type => {
      return [
        { key: 'true', value: true },
        { key: 'false', value: false },
      ];
    },
    valuesGroup: (value, _type) => {
      if (typeof value !== 'boolean') {
        return [
          {
            key: 'false',
            value: false,
          },
        ];
      }
      return [
        {
          key: value.toString(),
          value: value,
        },
      ];
    },
    addToGroup: v => v,
    view: createUniComponentFromWebComponent(BooleanGroupView),
  }),
];
