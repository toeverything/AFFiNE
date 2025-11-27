/**
 * @file ID Property Type Definition for AFFiNE Database
 * @description Defines the schema and configuration for the ID property type in AFFiNE databases.
 * This file establishes the core data structure for ID columns which serve as unique identifiers
 * in database tables.
 */
import zod from 'zod';

import { t } from '../../core/logical/type-presets.js';
import { propertyType } from '../../core/property/property-config.js';

/**
 * Base property type definition for ID columns
 * Registers 'id' as a recognized property type in the system
 */
export const idPropertyType = propertyType('id');

/**
 * Configuration for the ID property model
 * Defines the schema, default values, and validation rules for ID columns
 *
 * @remarks
 * The ID property supports optional prefix/suffix and configurable padding
 * to format ID values (e.g., PRJ-001, TASK-123, etc.)
 */
export const idPropertyModelConfig = idPropertyType.modelConfig({
  name: 'ID',
  propertyData: {
    schema: zod.object({
      prefix: zod.string().optional(),
      suffix: zod.string().optional(),
      padding: zod.union([zod.number(), zod.literal('auto')]).default(3),
    }),
    default: () => ({ prefix: undefined, suffix: undefined, padding: 3 }),
  },
  jsonValue: {
    schema: zod.string(),
    isEmpty: ({ value }: { value: string }) => !value,
    type: () => t.string.instance(),
  },
  rawValue: {
    schema: zod.string(),
    default: () => '',
    fromString: value => value,
    toString: ({ value }) => value ?? '',
    toJson: ({ value }) => value ?? '',
    fromJson: ({ value }) => (typeof value === 'string' ? value : ''),
    onUpdate: () => ({ dispose: () => {} }),
  },
});

// Note: The idPropertyConfig is defined in cell-renderer.ts
