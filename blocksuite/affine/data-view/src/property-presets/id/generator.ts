/**
 * @file ID Generator for ID Column Type
 * @description Utilities for generating and formatting unique IDs based on configuration
 */

import type { Property } from '../../core/view-manager/property.js';
import type { Row } from '../../core/view-manager/row.js';

/**
 * Format a number as an ID string with prefix, padding, and suffix
 *
 * @param num - The numeric part of the ID
 * @param prefix - Optional prefix to add before the number
 * @param padding - Number of digits to pad the number to
 * @param suffix - Optional suffix to add after the number
 * @returns Formatted ID string
 */
export function formatId(
  num: number,
  prefix?: string | null,
  padding: number = 3,
  suffix?: string | null
): string {
  // Pad the number with leading zeros
  const paddedNumber = num.toString().padStart(padding, '0');

  // Build the final ID by concatenating prefix, number and suffix
  // Handle both undefined and empty string values consistently
  const prefixStr = prefix === undefined || prefix === null ? '' : prefix;
  const suffixStr = suffix === undefined || suffix === null ? '' : suffix;
  return `${prefixStr}${paddedNumber}${suffixStr}`;
}

/**
 * Extract the numeric part from an ID string
 *
 * @param idValue - The ID string to extract from
 * @param prefix - Optional prefix to remove
 * @param suffix - Optional suffix to remove
 * @returns The extracted numeric value or null if no valid number found
 */
export function extractNumericPart(
  idValue: string,
  prefix?: string | null,
  suffix?: string | null
): number | null {
  if (!idValue || typeof idValue !== 'string') return null;

  let numericPart = idValue;

  // Remove prefix if it exists and is not empty
  if (
    prefix !== undefined &&
    prefix !== null &&
    prefix !== '' &&
    numericPart.startsWith(prefix)
  ) {
    numericPart = numericPart.substring(prefix.length);
  }

  // Remove suffix if it exists and is not empty
  if (
    suffix !== undefined &&
    suffix !== null &&
    suffix !== '' &&
    numericPart.endsWith(suffix)
  ) {
    numericPart = numericPart.substring(0, numericPart.length - suffix.length);
  }

  // Try different strategies to extract the numeric part

  // Strategy 1: The entire string is a number
  if (/^\d+$/.test(numericPart)) {
    const num = parseInt(numericPart, 10);
    return isNaN(num) ? null : num;
  }

  // Strategy 2: Extract first sequence of digits
  const matches = numericPart.match(/(\d+)/);
  if (matches && matches[1]) {
    const num = parseInt(matches[1], 10);
    return isNaN(num) ? null : num;
  }

  return null;
}

/**
 * Generates the next ID for a column based on property configuration
 * and existing IDs in the column
 *
 * @param property - The ID property
 * @returns Next ID string
 */
export function generateNextId(property: Property): string {
  // Get data from property configuration
  const data = property.data$.value;
  // Ensure consistent handling of prefix and suffix values
  const prefix = data.prefix as string | undefined | null;
  const suffix = data.suffix as string | undefined | null;
  const padding = (data.padding as number) || 3;

  // Find the highest existing ID number
  let highestNum = 0;

  // Get all cells with values in this property
  const idValues: string[] = [];
  property.view.rows$.value.forEach((row: Row) => {
    // Get the cell value for this property
    const cells = row.cells$.value;
    const cell = cells.find(c => c.propertyId === property.id);
    const cellValue = cell?.value$?.value;

    if (cellValue && typeof cellValue === 'string') {
      idValues.push(cellValue);
    }
  });

  // Extract numeric parts from existing IDs with same prefix/suffix
  idValues.forEach(idValue => {
    const num = extractNumericPart(idValue, prefix, suffix);

    if (num !== null && num > highestNum) {
      highestNum = num;
    }
  });

  // Generate next ID by incrementing the highest number
  const nextId = formatId(highestNum + 1, prefix, padding, suffix);
  return nextId;
}

/**
 * Auto-assigns IDs to all rows that don't have one
 *
 * @param property - The ID property
 */
export function assignMissingIds(property: Property): void {
  // Get data from property configuration
  const data = property.data$.value;
  // Ensure consistent handling of prefix and suffix values
  const prefix = data.prefix as string | undefined | null;
  const suffix = data.suffix as string | undefined | null;
  const padding = (data.padding as number) || 3;

  // Find the highest existing ID number
  let nextNum = 1;

  // Get all rows with IDs in the view
  const rowsWithIds = new Set<string>();
  property.view.rows$.value.forEach((row: Row) => {
    // Get the cell value for this property
    const cells = row.cells$.value;
    const cell = cells.find(c => c.propertyId === property.id);
    const idValue = cell?.value$?.value;

    if (idValue) {
      rowsWithIds.add(row.rowId);

      const num = extractNumericPart(idValue as string, prefix, suffix);
      if (num !== null && num >= nextNum) {
        nextNum = num + 1;
      }
    }
  });

  // Assign IDs to rows without them
  property.view.rows$.value.forEach((row: Row) => {
    if (!rowsWithIds.has(row.rowId)) {
      const newId = formatId(nextNum++, prefix, padding, suffix);
      // Update the cell with the new ID
      property.valueSet(row.rowId, newId);
    }
  });
}

/**
 * Initializes the ID column by assigning IDs to all existing rows
 * This should be called when a new ID column is created
 *
 * @param property - The ID property
 */
export function initializeIdsForAllRows(property: Property): void {
  // Check if any rows already have IDs
  let hasIds = false;
  property.view.rows$.value.forEach((row: Row) => {
    const cells = row.cells$.value;
    const cell = cells.find(c => c.propertyId === property.id);
    if (cell?.value$?.value) {
      hasIds = true;
    }
  });

  // If no rows have IDs, assign them
  if (!hasIds) {
    assignMissingIds(property);
  }
}

/**
 * Initialize IDs for all rows in a view
 * This is useful when creating a new ID column or converting from another type
 *
 * @param property - The ID property to initialize
 */
export function initializeAllIds(property: Property): void {
  if (property.type$.value !== 'id') {
    console.warn('Cannot initialize IDs for non-ID property');
    return;
  }

  // Get data from property configuration
  const data = property.data$.value;
  const prefix = data.prefix as string | undefined;
  const suffix = data.suffix as string | undefined;
  const padding = (data.padding as number) || 3;

  // Clear all existing values first
  property.view.rows$.value.forEach(row => {
    property.valueSet(row.rowId, '');
  });

  // Now assign sequential IDs to all rows
  let counter = 1;
  property.view.rows$.value.forEach(row => {
    const formattedId = formatId(counter++, prefix, padding, suffix);
    property.valueSet(row.rowId, formattedId);
  });
}
