import hash from '@emotion/hash';

import type { TypeInstance } from '../logical/type.js';
import { t } from '../logical/type-presets.js';
import { createUniComponentFromWebComponent } from '../utils/uni-component/uni-component.js';
import { BooleanGroupView } from './renderer/boolean-group.js';
import { NumberGroupView } from './renderer/number-group.js';
import { SelectGroupView } from './renderer/select-group.js';
import { StringGroupView } from './renderer/string-group.js';
import { DateGroupView } from './renderer/date-group.js';
import type { GroupByConfig } from './types.js';

import {
  differenceInCalendarDays,
  format as fmt,
  isToday,
  isYesterday,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from 'date-fns';


export const createGroupByConfig = <
  Data extends Record<string, unknown>,
  MatchType extends TypeInstance,
  GroupValue = unknown,
>(
  config: GroupByConfig<Data, MatchType, GroupValue>,
): GroupByConfig => config as never;

export const ungroups = {
  key: 'Ungroups',
  value: null,
};

const WEEK_OPTS_MON = { weekStartsOn: 1 } as const;
const WEEK_OPTS_SUN = { weekStartsOn: 0 } as const;

const DAY_MS = 86_400_000;
const rangeLabel = (a: Date, b: Date) =>
  `${fmt(a, 'MMM d yyyy')} – ${fmt(b, 'MMM d yyyy')}`;

function buildDateCfg(
  name: string,
  grouper: (iso: string | null) => { key: string; value: number | null }[],
  groupName: (v: number | null) => string,
): GroupByConfig {
  return createGroupByConfig({
    name,
    matchType: t.date.instance(),
    groupName: (_t, v) => groupName(v),
    defaultKeys: _t => [ungroups],
    valuesGroup: (v: string | null) => grouper(v),
    addToGroup: (grp, _old) => (grp == null ? null : new Date(grp).toISOString()),
    view: createUniComponentFromWebComponent(DateGroupView),
  });
}

const dateRelativeCfg = buildDateCfg(
  'date-relative',
  v => {
    if (!v) return [ungroups];
    const d = startOfDay(new Date(v));
    const daysAgo = differenceInCalendarDays(new Date(), d);
    if (isToday(d)) return [{ key: 'today', value: +d }];
    if (isYesterday(d)) return [{ key: 'yesterday', value: +d }];
    if (daysAgo <= 7) return [{ key: 'last7', value: +d }];
    if (daysAgo <= 30) return [{ key: 'last30', value: +d }];
    const m = startOfMonth(d);
    return [{ key: `${+m}`, value: +m }];
  },
  v => {
    if (v == null) return '';
    const d = startOfDay(new Date(v));
    const daysAgo = differenceInCalendarDays(new Date(), d);
    if (isToday(d)) return 'Today';
    if (isYesterday(d)) return 'Yesterday';
    if (daysAgo <= 7) return 'Last 7 days';
    if (daysAgo <= 30) return 'Last 30 days';
    return fmt(new Date(v), 'MMM yyyy');
  },
);

const dateDayCfg = buildDateCfg(
  'date-day',
  v => {
    if (!v) return [ungroups];
    const d = startOfDay(new Date(v));
    return [{ key: `${+d}`, value: +d }];
  },
  v => (v ? fmt(new Date(v), 'MMM d yyyy') : ''),
);

const dateWeekSunCfg = buildDateCfg(
  'date-week-sun',
  v => {
    if (!v) return [ungroups];
    const w = startOfWeek(new Date(v), WEEK_OPTS_SUN);
    return [{ key: `${+w}`, value: +w }];
  },
  v =>
    v
      ? rangeLabel(new Date(v), new Date(v + 6 * DAY_MS))
      : '',
);

const dateWeekMonCfg = buildDateCfg(
  'date-week-mon',
  v => {
    if (!v) return [ungroups];
    const w = startOfWeek(new Date(v), WEEK_OPTS_MON);
    return [{ key: `${+w}`, value: +w }];
  },
  v =>
    v
      ? rangeLabel(new Date(v), new Date(v + 6 * DAY_MS))
      : '',
);

const dateMonthCfg = buildDateCfg(
  'date-month',
  v => {
    if (!v) return [ungroups];
    const m = startOfMonth(new Date(v));
    return [{ key: `${+m}`, value: +m }];
  },
  v => (v ? fmt(new Date(v), 'MMM yyyy') : ''),
);

const dateYearCfg = buildDateCfg(
  'date-year',
  v => {
    if (!v) return [ungroups];
    const y = startOfYear(new Date(v));
    return [{ key: `${+y}`, value: +y }];
  },
  v => (v ? fmt(new Date(v), 'yyyy') : ''),
);

export const groupByMatchers: GroupByConfig[] = [
  createGroupByConfig({
    name: 'select',
    matchType: t.tag.instance(),
    groupName: (type, value: string | null) => {
      if (t.tag.is(type) && type.data) return type.data.find(v => v.id === value)?.value ?? '';
      return '';
    },
    defaultKeys: type =>
      t.tag.is(type) && type.data
        ? [
          ungroups,
          ...type.data.map(v => ({ key: v.id, value: v.id })),
        ]
        : [ungroups],
    valuesGroup: (value, _t) =>
      value == null
        ? [ungroups]
        : [{ key: `${value}`, value }],
    addToGroup: v => v,
    view: createUniComponentFromWebComponent(SelectGroupView),
  }),

  createGroupByConfig({
    name: 'multi-select',
    matchType: t.array.instance(t.tag.instance()),
    groupName: (type, value: string | null) => {
      if (t.array.is(type) && t.tag.is(type.element) && type.element.data)
        return type.element.data.find(v => v.id === value)?.value ?? '';
      return '';
    },
    defaultKeys: type =>
      t.array.is(type) && t.tag.is(type.element) && type.element.data
        ? [
          ungroups,
          ...type.element.data.map(v => ({ key: v.id, value: v.id })),
        ]
        : [ungroups],
    valuesGroup: (value, _t) => {
      if (value == null) return [ungroups];
      if (Array.isArray(value) && value.length)
        return value.map(id => ({ key: `${id}`, value: id }));
      return [ungroups];
    },
    addToGroup: (value, old) => {
      if (value == null) return old;
      return Array.isArray(old) ? [...old, value] : [value];
    },
    removeFromGroup: (value, old) =>
      Array.isArray(old) ? old.filter(v => v !== value) : old,
    view: createUniComponentFromWebComponent(SelectGroupView),
  }),

  createGroupByConfig({
    name: 'text',
    matchType: t.string.instance(),
    groupName: (_t, v) => `${v ?? ''}`,
    defaultKeys: _t => [ungroups],
    valuesGroup: (v, _t) =>
      typeof v !== 'string' || !v
        ? [ungroups]
        : [{ key: hash(v), value: v }],
    addToGroup: v => v,
    view: createUniComponentFromWebComponent(StringGroupView),
  }),

  createGroupByConfig({
    name: 'number',
    matchType: t.number.instance(),
    groupName: (_t, v) => `${v ?? ''}`,
    defaultKeys: _t => [ungroups],
    valuesGroup: (v, _t) =>
      typeof v !== 'number'
        ? [ungroups]
        : [{ key: `g:${Math.floor(v / 10)}`, value: Math.floor(v / 10) }],
    addToGroup: v => (typeof v === 'number' ? v * 10 : null),
    view: createUniComponentFromWebComponent(NumberGroupView),
  }),

  createGroupByConfig({
    name: 'boolean',
    matchType: t.boolean.instance(),
    groupName: (_t, v) => `${v?.toString() ?? ''}`,
    defaultKeys: _t => [
      { key: 'true', value: true },
      { key: 'false', value: false },
    ],
    valuesGroup: (v, _t) =>
      typeof v !== 'boolean'
        ? [{ key: 'false', value: false }]
        : [{ key: v.toString(), value: v }],
    addToGroup: v => v,
    view: createUniComponentFromWebComponent(BooleanGroupView),
  }),

  dateRelativeCfg,
  dateDayCfg,
  dateWeekSunCfg,
  dateWeekMonCfg,
  dateMonthCfg,
  dateYearCfg,
];
