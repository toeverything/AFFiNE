type AllowedUnits = 'px' | 'ms';

/**
 * get value with unit
 */
export const withUnit = (
  value: string | number,
  unit: AllowedUnits
): string => {
  if (typeof value === 'number') {
    return `${value}${unit}`;
  }

  if (/^\d+(\.\d+)?$/.test(value)) {
    return `${value}${unit}`;
  }

  return value;
};
