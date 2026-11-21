import type { NumberFormat } from './formatter.js';

export type NumberCellFormat = {
  type: NumberFormat;
  label: string;
  symbol: string; // New property for symbol
};

export const numberFormats: NumberCellFormat[] = [
  { type: 'number', label: 'Number', symbol: '#' },
  { type: 'numberWithCommas', label: 'Number With Commas', symbol: '#' },
  { type: 'percent', label: 'Percent', symbol: '%' },
  { type: 'currencyYen', label: 'Japanese Yen', symbol: '¥' },
  { type: 'currencyCNY', label: 'Chinese Yuan', symbol: '¥' },
  { type: 'currencyINR', label: 'Indian Rupee', symbol: '₹' },
  { type: 'currencyUSD', label: 'US Dollar', symbol: '$' },
  { type: 'currencyEUR', label: 'Euro', symbol: '€' },
  { type: 'currencyGBP', label: 'British Pound', symbol: '£' },
  { type: 'currencyILS', label: 'Israeli Shekel', symbol: '₪' },
];
