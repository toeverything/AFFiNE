import type { DocCustomPropertyInfo } from '../db';

/**
 * default built-in custom property, user can update and delete them
 */
export const BUILT_IN_CUSTOM_PROPERTY_TYPE = [
  {
    id: 'tags',
    type: 'tags',
  },
] as DocCustomPropertyInfo[];
