import { addDays } from 'date-fns/addDays';
import { addWeeks } from 'date-fns/addWeeks';
import { addMonths } from 'date-fns/addMonths';
import { addYears } from 'date-fns/addYears';
import { subDays } from 'date-fns/subDays';
import { subWeeks } from 'date-fns/subWeeks';
import { subMonths } from 'date-fns/subMonths';
import { subYears } from 'date-fns/subYears';
import { startOfDay } from 'date-fns/startOfDay';
import { endOfDay } from 'date-fns/endOfDay';
import { startOfWeek } from 'date-fns/startOfWeek';
import { endOfWeek } from 'date-fns/endOfWeek';
import { startOfMonth } from 'date-fns/startOfMonth';
import { endOfMonth } from 'date-fns/endOfMonth';
import { startOfYear } from 'date-fns/startOfYear';
import { endOfYear } from 'date-fns/endOfYear';
import { format } from 'date-fns/format';

import { t } from '../../logical/type-presets.js';
import { createFilter } from './create.js';

const weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6 = 0;
type Direction = 'past' | 'this' | 'next';
type Unit = 'day' | 'week' | 'month' | 'year';

function getRange(dir: Direction, unit: Unit): [number, number] {
  const now = new Date();

  const adjust = {
    day: { add: addDays, sub: subDays },
    week: { add: addWeeks, sub: subWeeks },
    month: { add: addMonths, sub: subMonths },
    year: { add: addYears, sub: subYears },
  } as const;

  const start = {
    day: startOfDay,
    week: (d: Date) => startOfWeek(d, { weekStartsOn }),
    month: startOfMonth,
    year: startOfYear,
  } as const;

  const end = {
    day: endOfDay,
    week: (d: Date) => endOfWeek(d, { weekStartsOn }),
    month: endOfMonth,
    year: endOfYear,
  } as const;

  let base = now;
  if (dir === 'past') base = adjust[unit].sub(now, 1);
  if (dir === 'next') base = adjust[unit].add(now, 1);

  return [start[unit](base).getTime(), end[unit](base).getTime()];
}

export const dateFilter = [
  createFilter({
    name: 'before',
    self: t.date.instance(),
    args: [t.date.instance()] as const,
    label: 'Before',
    shortString: v => (v ? ` < ${format(v.value, 'yyyy/MM/dd')}` : undefined),
    impl: (self, value) => (self == null ? false : self < value),
    defaultValue: args => subDays(args[0], 1).getTime(),
  }),
  createFilter({
    name: 'after',
    self: t.date.instance(),
    args: [t.date.instance()] as const,
    label: 'After',
    shortString: v => (v ? ` > ${format(v.value, 'yyyy/MM/dd')}` : undefined),
    impl: (self, value) => (self == null ? false : self > value),
    defaultValue: args => addDays(args[0], 1).getTime(),
  }),

  createFilter({
    name: 'relativeToToday',
    self: t.date.instance(),
    args: [t.relativeDate.instance()] as const,
    label: 'Is relative to today',
    shortString: arg =>
      arg
        ? `: ${arg.value[0].charAt(0).toUpperCase() + arg.value[0].slice(1)} ${arg.value[1]}`
        : undefined,
    impl: (self, arg) => {
      if (self == null) return false;
      const [dir, unit] = arg as [Direction, Unit];
      const [start, end] = getRange(dir, unit);
      return self >= start && self <= end;
    },
    defaultValue: args => {
      const [dir, unit] = args[0] as [Direction, Unit];
      const [start, end] = getRange(dir, unit);
      if (dir === 'past') return end;
      if (dir === 'next') return start;
      const now = Date.now();
      return now >= start && now <= end ? now : start;
    },
  }),
] as const;

// expose this helper for calendar previews
export { getRange };
