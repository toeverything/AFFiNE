import type { DocCustomPropertyInfo } from '../db';

/**
 * default built-in custom property, user can update and delete them
 *
 * 'id' and 'type' is request, 'index' is a manually maintained incremental key.
 */
export const BUILT_IN_CUSTOM_PROPERTY_TYPE = [
  {
    id: 'tags',
    type: 'tags',
    index: 'a0000001',
  },
  {
    id: 'docPrimaryMode',
    type: 'docPrimaryMode',
    show: 'always-hide',
    index: 'a0000002',
  },
  {
    id: 'journal',
    type: 'journal',
    show: 'always-hide',
    index: 'a0000003',
  },
] as DocCustomPropertyInfo[];
