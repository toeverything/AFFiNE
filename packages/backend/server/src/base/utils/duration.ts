type DurationUnit = 'd' | 'w' | 'M' | 'y' | 'h' | 'm' | 's' | 'ms';
type DurationInput = Partial<Record<DurationUnit, number>>;

const UnitToSecMap: Record<DurationUnit, number> = {
  ms: 0.001,
  s: 1,
  m: 60,
  h: 3600,
  d: 24 * 3600,
  w: 7 * 24 * 3600,
  M: 30 * 24 * 3600,
  y: 365 * 24 * 3600,
};

const KnownCharCodeToCharMap: Record<number, DurationUnit> = {
  100: 'd',
  119: 'w',
  77: 'M',
  121: 'y',
  104: 'h',
  109: 'm',
  115: 's',
};

function parse(str: string): DurationInput {
  let input: DurationInput = {};

  let acc = 0;
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    const code = ch.charCodeAt(0);

    // number [0..9]
    if (code >= 48 && code <= 57) {
      acc = acc * 10 + code - 48;
    } else {
      let unit = KnownCharCodeToCharMap[code];
      if (!unit) {
        throw new Error(`Invalid duration string unit ${ch}`);
      }

      // look ahead a char for 'ms' checking if unit met 'm'
      if (unit === 'm' && str[i + 1] === 's') {
        unit = 'ms';
        i++;
      }

      input[unit] = acc;
      acc = 0;
    }
  }

  return input;
}

export const Due = {
  ms: (dueStr: string | DurationInput) => {
    const input = typeof dueStr === 'string' ? parse(dueStr) : dueStr;
    return Object.entries(input).reduce((duration, [unit, val]) => {
      return duration + UnitToSecMap[unit as DurationUnit] * (val || 0) * 1000;
    }, 0);
  },
  s: (dueStr: string | DurationInput) => {
    const input = typeof dueStr === 'string' ? parse(dueStr) : dueStr;
    return Object.entries(input).reduce((duration, [unit, val]) => {
      return duration + UnitToSecMap[unit as DurationUnit] * (val || 0);
    }, 0);
  },
  parse,
  after: (dueStr: string | number | DurationInput, date?: Date) => {
    const timestamp = typeof dueStr === 'number' ? dueStr : Due.ms(dueStr);
    return new Date((date?.getTime() ?? Date.now()) + timestamp);
  },
  before: (dueStr: string | number | DurationInput, date?: Date) => {
    const timestamp = typeof dueStr === 'number' ? dueStr : Due.ms(dueStr);
    return new Date((date?.getTime() ?? Date.now()) - timestamp);
  },
};
