/**
 * @file Type Conversion to ID Property
 * @description Defines conversion functions for transforming other property types to ID type
 */

// Defining our interface here to avoid circular imports
interface ConvertFunctionParams<P = any, C = any> {
  property: P;
  cells: C[];
}

/**
 * Converts text property to ID property
 *
 * @param params - Conversion parameters
 * @returns Converted property data and cell values
 */
export function textToIdConverter(params: ConvertFunctionParams<any, any>) {
  // Convert property data
  const propertyData = {
    prefix: undefined,
    suffix: undefined,
    padding: 3,
  };

  // Reset all cell values to empty so they'll be auto-assigned
  const cells = Array.isArray(params.cells) ? params.cells.map(() => '') : [];

  return {
    property: propertyData,
    cells,
  };
}

/**
 * Converts number property to ID property
 *
 * @param params - Conversion parameters
 * @returns Converted property data and cell values
 */
export function numberToIdConverter(params: ConvertFunctionParams<any, any>) {
  // Just use the text converter - we'll regenerate all IDs
  return textToIdConverter(params);
}
