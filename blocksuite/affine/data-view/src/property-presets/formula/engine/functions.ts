import { addDays } from 'date-fns/addDays';
import { addMonths } from 'date-fns/addMonths';
import { addQuarters } from 'date-fns/addQuarters';
import { addWeeks } from 'date-fns/addWeeks';
import { addYears } from 'date-fns/addYears';
import { differenceInDays } from 'date-fns/differenceInDays';
import { differenceInHours } from 'date-fns/differenceInHours';
import { differenceInMinutes } from 'date-fns/differenceInMinutes';
import { differenceInMonths } from 'date-fns/differenceInMonths';
import { differenceInQuarters } from 'date-fns/differenceInQuarters';
import { differenceInSeconds } from 'date-fns/differenceInSeconds';
import { differenceInWeeks } from 'date-fns/differenceInWeeks';
import { differenceInYears } from 'date-fns/differenceInYears';
import { format } from 'date-fns/format';
import { getISODay } from 'date-fns/getISODay';
import { startOfDay } from 'date-fns/startOfDay';

import {
  checkNumber,
  checkText,
  expectDate,
  expectList,
  expectNumber,
  expectText,
  FormulaRuntimeError,
  type FormulaType,
  type FormulaValue,
  isEmptyValue,
  isTruthy,
  valuesEqual,
  valueToText,
} from './values.js';

export type FormulaFunctionContext = {
  now: () => Date;
};

export type FormulaFunctionCategory = 'Logic' | 'Math' | 'Text' | 'Date';

export type FormulaFunction = {
  name: string;
  category: FormulaFunctionCategory;
  signature: string;
  description: string;
  minArgs: number;
  maxArgs: number;
  returns: FormulaType | ((args: FormulaType[]) => FormulaType);
  /**
   * Functions without `call` are special forms which only evaluate the
   * arguments they need, see the evaluator.
   */
  call?: (args: FormulaValue[], ctx: FormulaFunctionContext) => FormulaValue;
};

const unify = (types: FormulaType[]): FormulaType => {
  const [first, ...rest] = types;
  if (!first) return 'unknown';
  return rest.every(type => type === first) ? first : 'unknown';
};

const numberFn = (
  name: string,
  signature: string,
  description: string,
  fn: (value: number) => number
): FormulaFunction => ({
  name,
  category: 'Math',
  signature,
  description,
  minArgs: 1,
  maxArgs: 1,
  returns: 'number',
  call: ([value = null]) =>
    value == null ? null : checkNumber(fn(expectNumber(value, name))),
});

const textFn = (
  name: string,
  description: string,
  fn: (value: string) => string
): FormulaFunction => ({
  name,
  category: 'Text',
  signature: `${name}(text)`,
  description,
  minArgs: 1,
  maxArgs: 1,
  returns: 'text',
  call: ([value = null]) => fn(expectText(value, name)),
});

const datePartFn = (
  name: string,
  description: string,
  fn: (value: Date) => number
): FormulaFunction => ({
  name,
  category: 'Date',
  signature: `${name}(date)`,
  description,
  minArgs: 1,
  maxArgs: 1,
  returns: 'number',
  call: ([value = null]) => {
    const date = expectDate(value, name);
    return date ? fn(date) : null;
  },
});

// Shifts the decimal point through the string form of the number, so that
// round(2.345, 2) gives 2.35 instead of suffering from 2.345 * 100 = 234.4999…
const shiftDecimal = (value: number, places: number) => {
  const [mantissa, exponent = '0'] = String(value).split('e');
  return Number(`${mantissa}e${Number(exponent) + places}`);
};

const flatten = (values: FormulaValue[]): FormulaValue[] =>
  values.flatMap(value => (Array.isArray(value) ? flatten(value) : [value]));

const numbersOf = (args: FormulaValue[], name: string) =>
  flatten(args)
    .filter(value => value != null)
    .map(value => expectNumber(value, name));

type DateUnit =
  | 'year'
  | 'quarter'
  | 'month'
  | 'week'
  | 'day'
  | 'hour'
  | 'minute'
  | 'second';

const DATE_UNITS = new Set<DateUnit>([
  'year',
  'quarter',
  'month',
  'week',
  'day',
  'hour',
  'minute',
  'second',
]);

const toDateUnit = (value: FormulaValue, name: string): DateUnit => {
  const unit = expectText(value, name)
    .trim()
    .toLowerCase()
    .replace(/s$/, '') as DateUnit;
  if (!DATE_UNITS.has(unit)) {
    throw new FormulaRuntimeError(
      `${name} expects a unit like "days", "weeks", "months" or "years"`
    );
  }
  return unit;
};

const MS_PER_UNIT: Partial<Record<DateUnit, number>> = {
  hour: 60 * 60 * 1000,
  minute: 60 * 1000,
  second: 1000,
};

const addToDate = (date: Date, amount: number, unit: DateUnit): Date => {
  const ms = MS_PER_UNIT[unit];
  if (ms) return new Date(date.getTime() + amount * ms);
  const whole = Math.trunc(amount);
  switch (unit) {
    case 'year':
      return addYears(date, whole);
    case 'quarter':
      return addQuarters(date, whole);
    case 'month':
      return addMonths(date, whole);
    case 'week':
      return addWeeks(date, whole);
    default:
      return addDays(date, whole);
  }
};

const DIFFERENCE: Record<DateUnit, (a: Date, b: Date) => number> = {
  year: differenceInYears,
  quarter: differenceInQuarters,
  month: differenceInMonths,
  week: differenceInWeeks,
  day: differenceInDays,
  hour: differenceInHours,
  minute: differenceInMinutes,
  second: differenceInSeconds,
};

const dateAddFn = (name: string, sign: 1 | -1): FormulaFunction => ({
  name,
  category: 'Date',
  signature: `${name}(date, amount, unit)`,
  description:
    sign > 0
      ? 'Adds time to a date. Units: years, quarters, months, weeks, days, hours, minutes, seconds.'
      : 'Subtracts time from a date. Units: years, quarters, months, weeks, days, hours, minutes, seconds.',
  minArgs: 3,
  maxArgs: 3,
  returns: 'date',
  call: ([date = null, amount = null, unit = null]) => {
    const value = expectDate(date, name);
    const unitValue = toDateUnit(unit, name);
    if (!value || amount == null) return value;
    return addToDate(value, sign * expectNumber(amount, name), unitValue);
  },
});

const FUNCTIONS: FormulaFunction[] = [
  // Logic
  {
    name: 'if',
    category: 'Logic',
    signature: 'if(condition, then, else)',
    description: 'Returns "then" when the condition is true, otherwise "else".',
    minArgs: 2,
    maxArgs: 3,
    returns: args => unify(args.slice(1)),
  },
  {
    name: 'ifs',
    category: 'Logic',
    signature: 'ifs(condition1, value1, condition2, value2, ..., else)',
    description:
      'Returns the value of the first true condition, or the last argument when none match.',
    minArgs: 2,
    maxArgs: Infinity,
    returns: args =>
      unify([
        ...args.filter((_, i) => i % 2 === 1),
        ...(args.length % 2 === 1 ? args.slice(-1) : []),
      ]),
  },
  {
    name: 'and',
    category: 'Logic',
    signature: 'and(a, b, ...)',
    description: 'True when every argument is true.',
    minArgs: 1,
    maxArgs: Infinity,
    returns: 'boolean',
  },
  {
    name: 'or',
    category: 'Logic',
    signature: 'or(a, b, ...)',
    description: 'True when any argument is true.',
    minArgs: 1,
    maxArgs: Infinity,
    returns: 'boolean',
  },
  {
    name: 'not',
    category: 'Logic',
    signature: 'not(value)',
    description: 'Inverts a true/false value.',
    minArgs: 1,
    maxArgs: 1,
    returns: 'boolean',
    call: ([value = null]) => !isTruthy(value),
  },
  {
    name: 'empty',
    category: 'Logic',
    signature: 'empty(value)',
    description: 'True when the value is empty.',
    minArgs: 1,
    maxArgs: 1,
    returns: 'boolean',
    call: ([value = null]) => isEmptyValue(value),
  },
  {
    name: 'equal',
    category: 'Logic',
    signature: 'equal(a, b)',
    description: 'True when both values are the same.',
    minArgs: 2,
    maxArgs: 2,
    returns: 'boolean',
    call: ([a = null, b = null]) => valuesEqual(a, b),
  },

  // Math
  numberFn('abs', 'abs(number)', 'The absolute value.', Math.abs),
  numberFn('ceil', 'ceil(number)', 'Rounds up to an integer.', Math.ceil),
  numberFn('floor', 'floor(number)', 'Rounds down to an integer.', Math.floor),
  numberFn('sqrt', 'sqrt(number)', 'The square root.', Math.sqrt),
  numberFn('exp', 'exp(number)', 'e raised to the given power.', Math.exp),
  numberFn('ln', 'ln(number)', 'The natural logarithm.', Math.log),
  numberFn('log10', 'log10(number)', 'The base 10 logarithm.', Math.log10),
  numberFn('sign', 'sign(number)', 'Returns 1, -1 or 0.', Math.sign),
  {
    name: 'round',
    category: 'Math',
    signature: 'round(number, digits?)',
    description: 'Rounds to the given number of decimal places (default 0).',
    minArgs: 1,
    maxArgs: 2,
    returns: 'number',
    call: ([value = null, digits = null]) => {
      if (value == null) return null;
      const number = expectNumber(value, 'round');
      const places = Math.min(
        Math.max(Math.trunc(expectNumber(digits, 'round')), 0),
        12
      );
      return checkNumber(
        Math.sign(number) *
          shiftDecimal(
            Math.round(shiftDecimal(Math.abs(number), places)),
            -places
          )
      );
    },
  },
  {
    name: 'pow',
    category: 'Math',
    signature: 'pow(base, exponent)',
    description: 'Raises a number to a power, same as base ^ exponent.',
    minArgs: 2,
    maxArgs: 2,
    returns: 'number',
    call: ([base = null, exponent = null]) =>
      checkNumber(expectNumber(base, 'pow') ** expectNumber(exponent, 'pow')),
  },
  {
    name: 'mod',
    category: 'Math',
    signature: 'mod(number, divisor)',
    description: 'The remainder of a division, same as number % divisor.',
    minArgs: 2,
    maxArgs: 2,
    returns: 'number',
    call: ([number = null, divisor = null]) => {
      const d = expectNumber(divisor, 'mod');
      if (d === 0) throw new FormulaRuntimeError('Division by zero');
      return checkNumber(expectNumber(number, 'mod') % d);
    },
  },
  {
    name: 'min',
    category: 'Math',
    signature: 'min(a, b, ...)',
    description: 'The smallest number. Empty values are ignored.',
    minArgs: 1,
    maxArgs: Infinity,
    returns: 'number',
    call: args => {
      const numbers = numbersOf(args, 'min');
      return numbers.length ? Math.min(...numbers) : null;
    },
  },
  {
    name: 'max',
    category: 'Math',
    signature: 'max(a, b, ...)',
    description: 'The largest number. Empty values are ignored.',
    minArgs: 1,
    maxArgs: Infinity,
    returns: 'number',
    call: args => {
      const numbers = numbersOf(args, 'max');
      return numbers.length ? Math.max(...numbers) : null;
    },
  },
  {
    name: 'sum',
    category: 'Math',
    signature: 'sum(a, b, ...)',
    description: 'Adds numbers together. Empty values are ignored.',
    minArgs: 1,
    maxArgs: Infinity,
    returns: 'number',
    call: args =>
      checkNumber(numbersOf(args, 'sum').reduce((a, b) => a + b, 0)),
  },
  {
    name: 'average',
    category: 'Math',
    signature: 'average(a, b, ...)',
    description: 'The mean of the numbers. Empty values are ignored.',
    minArgs: 1,
    maxArgs: Infinity,
    returns: 'number',
    call: args => {
      const numbers = numbersOf(args, 'average');
      if (!numbers.length) return null;
      return checkNumber(numbers.reduce((a, b) => a + b, 0) / numbers.length);
    },
  },
  {
    name: 'toNumber',
    category: 'Math',
    signature: 'toNumber(value)',
    description:
      'Converts text, dates and checkboxes to a number. Returns empty when the text is not a number.',
    minArgs: 1,
    maxArgs: 1,
    returns: 'number',
    call: ([value = null]) => {
      if (value == null) return null;
      if (typeof value === 'number') return value;
      if (typeof value === 'boolean') return value ? 1 : 0;
      if (value instanceof Date) return value.getTime();
      if (typeof value === 'string') {
        const trimmed = value.trim().replace(/,/g, '');
        const number = trimmed ? Number(trimmed) : NaN;
        return Number.isFinite(number) ? number : null;
      }
      throw new FormulaRuntimeError('toNumber cannot convert a list');
    },
  },

  // Text
  {
    name: 'concat',
    category: 'Text',
    signature: 'concat(a, b, ...)',
    description: 'Joins values together as text.',
    minArgs: 1,
    maxArgs: Infinity,
    returns: 'text',
    call: args => checkText(args.map(valueToText).join('')),
  },
  {
    name: 'format',
    category: 'Text',
    signature: 'format(value)',
    description: 'Converts any value to text.',
    minArgs: 1,
    maxArgs: 1,
    returns: 'text',
    call: ([value = null]) => valueToText(value),
  },
  {
    name: 'length',
    category: 'Text',
    signature: 'length(textOrList)',
    description: 'The number of characters in text, or items in a list.',
    minArgs: 1,
    maxArgs: 1,
    returns: 'number',
    call: ([value = null]) => {
      if (Array.isArray(value)) return value.length;
      return [...expectText(value, 'length')].length;
    },
  },
  textFn('lower', 'Converts text to lowercase.', v => v.toLowerCase()),
  textFn('upper', 'Converts text to uppercase.', v => v.toUpperCase()),
  textFn('trim', 'Removes spaces from both ends of text.', v => v.trim()),
  {
    name: 'contains',
    category: 'Text',
    signature: 'contains(textOrList, search)',
    description:
      'True when the text contains the search text, or the list contains the value.',
    minArgs: 2,
    maxArgs: 2,
    returns: 'boolean',
    call: ([value = null, search = null]) => {
      if (Array.isArray(value)) {
        return value.some(item => valuesEqual(item, search));
      }
      return expectText(value, 'contains').includes(valueToText(search));
    },
  },
  {
    name: 'startsWith',
    category: 'Text',
    signature: 'startsWith(text, search)',
    description: 'True when the text starts with the search text.',
    minArgs: 2,
    maxArgs: 2,
    returns: 'boolean',
    call: ([value = null, search = null]) =>
      expectText(value, 'startsWith').startsWith(valueToText(search)),
  },
  {
    name: 'endsWith',
    category: 'Text',
    signature: 'endsWith(text, search)',
    description: 'True when the text ends with the search text.',
    minArgs: 2,
    maxArgs: 2,
    returns: 'boolean',
    call: ([value = null, search = null]) =>
      expectText(value, 'endsWith').endsWith(valueToText(search)),
  },
  {
    name: 'replace',
    category: 'Text',
    signature: 'replace(text, search, replacement)',
    description: 'Replaces every occurrence of the search text.',
    minArgs: 3,
    maxArgs: 3,
    returns: 'text',
    call: ([value = null, search = null, replacement = null]) => {
      const text = expectText(value, 'replace');
      const pattern = valueToText(search);
      if (!pattern) return text;
      return checkText(text.split(pattern).join(valueToText(replacement)));
    },
  },
  {
    name: 'slice',
    category: 'Text',
    signature: 'slice(text, start, end?)',
    description:
      'Part of the text from start (inclusive) to end (exclusive). Positions start at 0.',
    minArgs: 2,
    maxArgs: 3,
    returns: 'text',
    call: ([value = null, start = null, end = null]) => {
      const chars = [...expectText(value, 'slice')];
      return chars
        .slice(
          Math.trunc(expectNumber(start, 'slice')),
          end == null ? undefined : Math.trunc(expectNumber(end, 'slice'))
        )
        .join('');
    },
  },
  {
    name: 'repeat',
    category: 'Text',
    signature: 'repeat(text, times)',
    description: 'Repeats the text the given number of times.',
    minArgs: 2,
    maxArgs: 2,
    returns: 'text',
    call: ([value = null, times = null]) => {
      const text = expectText(value, 'repeat');
      const count = Math.max(Math.trunc(expectNumber(times, 'repeat')), 0);
      if (text.length * count > 10000) {
        throw new FormulaRuntimeError('Text is too long');
      }
      return text.repeat(count);
    },
  },
  {
    name: 'join',
    category: 'Text',
    signature: 'join(list, separator)',
    description: 'Joins the items of a list with a separator.',
    minArgs: 2,
    maxArgs: 2,
    returns: 'text',
    call: ([list = null, separator = null]) =>
      checkText(
        expectList(list, 'join')
          .map(valueToText)
          .join(expectText(separator, 'join'))
      ),
  },

  // Date
  {
    name: 'now',
    category: 'Date',
    signature: 'now()',
    description: 'The current date and time.',
    minArgs: 0,
    maxArgs: 0,
    returns: 'date',
    call: (_, ctx) => ctx.now(),
  },
  {
    name: 'today',
    category: 'Date',
    signature: 'today()',
    description: 'The current date, without time.',
    minArgs: 0,
    maxArgs: 0,
    returns: 'date',
    call: (_, ctx) => startOfDay(ctx.now()),
  },
  dateAddFn('dateAdd', 1),
  dateAddFn('dateSubtract', -1),
  {
    name: 'dateBetween',
    category: 'Date',
    signature: 'dateBetween(date1, date2, unit)',
    description:
      'The time between two dates in whole units (date1 - date2). Units: years, quarters, months, weeks, days, hours, minutes, seconds.',
    minArgs: 3,
    maxArgs: 3,
    returns: 'number',
    call: ([a = null, b = null, unit = null]) => {
      const left = expectDate(a, 'dateBetween');
      const right = expectDate(b, 'dateBetween');
      const unitValue = toDateUnit(unit, 'dateBetween');
      if (!left || !right) return null;
      return DIFFERENCE[unitValue](left, right);
    },
  },
  {
    name: 'formatDate',
    category: 'Date',
    signature: 'formatDate(date, pattern)',
    description:
      'Formats a date as text, e.g. formatDate(now(), "yyyy-MM-dd"). Uses date-fns patterns.',
    minArgs: 2,
    maxArgs: 2,
    returns: 'text',
    call: ([date = null, pattern = null]) => {
      const value = expectDate(date, 'formatDate');
      const patternText = expectText(pattern, 'formatDate');
      if (!value) return '';
      try {
        return checkText(format(value, patternText));
      } catch {
        throw new FormulaRuntimeError(
          `formatDate does not understand the pattern "${patternText}"`
        );
      }
    },
  },
  datePartFn('year', 'The year of a date.', d => d.getFullYear()),
  datePartFn('month', 'The month of a date, 1 to 12.', d => d.getMonth() + 1),
  datePartFn('day', 'The day of the month, 1 to 31.', d => d.getDate()),
  datePartFn(
    'weekday',
    'The day of the week, 1 (Monday) to 7 (Sunday).',
    getISODay
  ),
  datePartFn('hour', 'The hour of a date, 0 to 23.', d => d.getHours()),
  datePartFn('minute', 'The minute of a date, 0 to 59.', d => d.getMinutes()),
  datePartFn('timestamp', 'Milliseconds since 1970-01-01.', d => d.getTime()),
  {
    name: 'fromTimestamp',
    category: 'Date',
    signature: 'fromTimestamp(milliseconds)',
    description: 'Creates a date from milliseconds since 1970-01-01.',
    minArgs: 1,
    maxArgs: 1,
    returns: 'date',
    call: ([value = null]) => {
      if (value == null) return null;
      const date = new Date(expectNumber(value, 'fromTimestamp'));
      if (Number.isNaN(date.getTime())) {
        throw new FormulaRuntimeError('fromTimestamp got an invalid date');
      }
      return date;
    },
  },
];

export const formulaFunctions: readonly FormulaFunction[] = FUNCTIONS;

const FUNCTION_MAP = new Map(FUNCTIONS.map(fn => [fn.name.toLowerCase(), fn]));

export const getFormulaFunction = (name: string) =>
  FUNCTION_MAP.get(name.toLowerCase());

export const unifyFormulaTypes = unify;
