import { addDays } from 'date-fns/addDays';
import { addMonths } from 'date-fns/addMonths';
import { addWeeks } from 'date-fns/addWeeks';
import { addYears } from 'date-fns/addYears';
import { endOfDay } from 'date-fns/endOfDay';
import { endOfMonth } from 'date-fns/endOfMonth';
import { endOfWeek } from 'date-fns/endOfWeek';
import { endOfYear } from 'date-fns/endOfYear';
import { format } from 'date-fns/format';
import { startOfDay } from 'date-fns/startOfDay';
import { startOfMonth } from 'date-fns/startOfMonth';
import { startOfWeek } from 'date-fns/startOfWeek';
import { startOfYear } from 'date-fns/startOfYear';
import { subDays } from 'date-fns/subDays';
import { subMonths } from 'date-fns/subMonths';
import { subWeeks } from 'date-fns/subWeeks';
import { subYears } from 'date-fns/subYears';

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
    shortString: v =>
      typeof v?.value === 'number' && Number.isFinite(v.value)
        ? `: Before ${format(v.value, 'yyyy/MM/dd')}`
        : undefined,
    impl: (self, value) => (self == null ? false : self < value),
    defaultValue: args => subDays(args[0], 1).getTime(),
  }),
  createFilter({
    name: 'after',
    self: t.date.instance(),
    args: [t.date.instance()] as const,
    label: 'After',
    shortString: v =>
      typeof v?.value === 'number' && Number.isFinite(v.value)
        ? `: After ${format(v.value, 'yyyy/MM/dd')}`
        : undefined,
    impl: (self, value) => (self == null ? false : self > value),
    defaultValue: args => addDays(args[0], 1).getTime(),
  }),

  createFilter({
    name: 'relativeToToday',
    self: t.date.instance(),
    args: [t.relativeDate.instance()] as const,
    label: 'Is relative to today',
    shortString: arg => {
      const dir = arg?.value?.[0];
      const unit = arg?.value?.[1];
      if (!dir || !unit) return undefined;
      return `: ${dir.charAt(0).toUpperCase() + dir.slice(1)} ${unit}`;
    },
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

export { getRange };
