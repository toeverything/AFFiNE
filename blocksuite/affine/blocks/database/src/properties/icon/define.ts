import { propertyType, t } from '@blocksuite/data-view';
import zod from 'zod';

import { decodeIconValue, encodeIconValue, IconValueSchema } from './value.js';

export { type IconValue, IconValueSchema } from './value.js';

export const iconColumnType = propertyType('icon');

/**
 * A per-row icon, the way every row in the plan this mirrors is a page with
 * its own emoji. Relation chips read it, so an icon set once shows up
 * everywhere that row is referenced.
 */
export const iconPropertyModelConfig = iconColumnType.modelConfig({
  name: 'Icon',
  propertyData: {
    schema: zod.object({}),
    default: () => ({}),
  },
  jsonValue: {
    schema: zod.string(),
    type: () => t.string.instance(),
    isEmpty: ({ value }) => !value,
  },
  rawValue: {
    schema: IconValueSchema,
    default: () => null,
    // The database clipboard copies `toString` and pastes through
    // `fromString`, so this has to round-trip too. An emoji is still copied
    // as itself; a glyph has no character, so it goes out encoded.
    toString: ({ value }) => encodeIconValue(value),
    fromString: ({ value }) => ({ value: decodeIconValue(value) }),
    toJson: ({ value }) => encodeIconValue(value),
    fromJson: ({ value }) => decodeIconValue(value),
  },
  minWidth: 44,
});
