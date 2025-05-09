import zod from 'zod';
export const NumberFormatSchema = zod.enum([
  'number',
  'numberWithCommas',
  'percent',
  'currencyYen',
  'currencyINR',
  'currencyCNY',
  'currencyUSD',
  'currencyEUR',
  'currencyGBP',
]);
export type NumberFormat = zod.infer<typeof NumberFormatSchema>;

const currency = (currency: string): Intl.NumberFormatOptions => ({
  style: 'currency',
  currency,
  currencyDisplay: 'symbol',
});

const numberFormatDefaultConfig: Record<
  NumberFormat,
  Intl.NumberFormatOptions
> = {
  number: { style: 'decimal', useGrouping: false },
  numberWithCommas: { style: 'decimal', useGrouping: true },
  percent: { style: 'percent', useGrouping: false },
  currencyINR: currency('INR'),
  currencyYen: currency('JPY'),
  currencyCNY: currency('CNY'),
  currencyUSD: currency('USD'),
  currencyEUR: currency('EUR'),
  currencyGBP: currency('GBP'),
};

export function formatNumber(
  value: number,
  format: NumberFormat,
  decimals?: number
) {
  const formatterOptions = { ...numberFormatDefaultConfig[format] };
  if (decimals !== undefined) {
    // for feature flag should default to 0 after release
    Object.assign(formatterOptions, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }
  const formatter = new Intl.NumberFormat(navigator.language, formatterOptions);
  return formatter.format(value);
}

export function getLocaleDecimalSeparator(locale?: string) {
  return (1.1).toLocaleString(locale ?? navigator.language).slice(1, 2);
}

// Since we Intl does not provide a parse function we just made it ourself
export function parseNumber(value: string, decimalSeparator?: string): number {
  decimalSeparator = decimalSeparator ?? getLocaleDecimalSeparator();

  // Normalize decimal separator to a period for consistency
  const normalizedValue = value.replace(
    new RegExp(`\\${decimalSeparator}`, 'g'),
    '.'
  );

  // Remove any leading and trailing non-numeric characters except valid signs, decimal points, and exponents
  let sanitizedValue = normalizedValue.replace(/^[^\d-+eE.]+|[^\d]+$/g, '');

  // Remove non-numeric characters except decimal points, exponents, and valid signs
  sanitizedValue = sanitizedValue.replace(/[^0-9.eE+-]/g, '');

  // Handle multiple signs: Keep only the first sign
  sanitizedValue = sanitizedValue.replace(/([-+]){2,}/g, '$1');

  // Handle misplaced signs: Keep only the leading sign and sign after 'e' or 'E'
  sanitizedValue = sanitizedValue.replace(
    /^([-+]?)[^eE]*([eE][-+]?\d+)?$/,
    (_, p1, p2) =>
      p1 +
      sanitizedValue.replace(/[eE].*/, '').replace(/[^\d.]/g, '') +
      (p2 || '')
  );

  // Handle multiple decimal points: Keep only the first one in the main part
  sanitizedValue = sanitizedValue.replace(/(\..*)\./g, '$1');

  // If there is an 'e' or 'E', handle the scientific notation
  if (/[eE]/.test(sanitizedValue)) {
    const [base, exp] = sanitizedValue.split(/[eE]/);
    if (
      !base ||
      !exp ||
      exp.includes('.') ||
      exp.includes('e') ||
      exp.includes('E')
    ) {
      return NaN; // Invalid scientific notation
    }
    return parseFloat(sanitizedValue);
  }

  return parseFloat(sanitizedValue);
}
