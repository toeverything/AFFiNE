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

const weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6 = 1;

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
    args: [t.string.instance(), t.string.instance()] as const,
    label: 'Is relative to today',
    shortString: (dir, unit) =>
      dir && unit
        ? `: ${dir.value.charAt(0).toUpperCase() + dir.value.slice(1)} ${unit.value}`
        : undefined,

    impl: (self, dirRaw: string, unitRaw: string) => {
      if (self == null) return false;
      const dir = dirRaw as Direction;
      const unit = unitRaw as Unit;
      const [start, end] = getRange(dir, unit);
      return self >= start && self <= end;
    },

    defaultValue: args => {
      const dir = args[0] as Direction;
      const unit = args[1] as Unit;
      const [start, end] = getRange(dir, unit);
      if (dir === 'past') return end;
      if (dir === 'next') return start;
      const now = Date.now();
      return now >= start && now <= end ? now : start;
    },
  }),
] as const;
