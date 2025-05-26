// TypeScript preset for the unique ID column in AFFiNE databases
// This file defines the structure, generation logic, and validation for the ID type

// Types and config are now managed in id/define.ts and core/property/property-config.js

export interface IdPropertyOptions {
  prefix?: string; // Optional, must not end with a digit
  suffix?: string; // Optional, must not start with a digit
  padding: number | 'auto'; // Number of digits or 'auto'
}

export interface IdPropertyValue {
  value: string; // The generated ID, not editable
  index: number; // Sequential number (for internal management)
}

export const MAX_ID_LENGTH = 32;

function isValidPrefix(prefix?: string): boolean {
  return !prefix || !/\d$/.test(prefix);
}

function isValidSuffix(suffix?: string): boolean {
  return !suffix || !/^\d/.test(suffix);
}

function padNumber(
  num: number,
  padding: number | 'auto',
  lastValue?: string
): string {
  let padLength = 1;
  if (typeof padding === 'number') {
    padLength = padding;
  } else if (padding === 'auto' && lastValue) {
    // Extract the numeric part of the last value
    const match = lastValue.match(/(\d+)$/);
    if (match && match[1]) padLength = match[1].length;
  }
  return num.toString().padStart(padLength, '0');
}

export function generateId(
  index: number,
  options: IdPropertyOptions,
  lastValue?: string
): string {
  if (!isValidPrefix(options.prefix))
    throw new Error('Prefix must not end with a digit.');
  if (!isValidSuffix(options.suffix))
    throw new Error('Suffix must not start with a digit.');
  const numStr = padNumber(index, options.padding, lastValue);
  const id = `${options.prefix ?? ''}${numStr}${options.suffix ?? ''}`;
  return id.length <= MAX_ID_LENGTH ? id : `${numStr}`; // Fallback to just the number if too long
}

// The IdPropertyPreset is now exported as idPropertyConfig in id/define.ts

// TODO: Add unit tests and integrate into the property presets list
