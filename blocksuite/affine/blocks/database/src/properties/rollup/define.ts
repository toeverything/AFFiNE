import { propertyType, t } from '@blocksuite/data-view';
import zod from 'zod';

import { ROLLUP_CALCS } from './compute.js';

export const rollupColumnType = propertyType('rollup');

/**
 * A rollup walks a relation on the same row and aggregates one property of
 * every row it reaches. The target property may itself be a rollup, which is
 * how a percentage climbs several levels of a plan.
 */
export const rollupPropertyModelConfig = rollupColumnType.modelConfig({
  name: 'Rollup',
  propertyData: {
    schema: zod.object({
      relationPropertyId: zod.string(),
      targetPropertyId: zod.string(),
      calc: zod.enum(ROLLUP_CALCS),
      display: zod.enum(['number', 'bar']),
    }),
    default: () => ({
      relationPropertyId: '',
      targetPropertyId: '',
      calc: 'count' as const,
      display: 'number' as const,
    }),
  },
  jsonValue: {
    schema: zod.number().optional(),
    type: () => t.number.instance(),
    isEmpty: ({ value }) => value == null,
  },
  rawValue: {
    schema: zod.number().optional(),
    default: () => undefined,
    toString: ({ value }) => (value == null ? '' : String(value)),
    // The value is derived, so text can never set it.
    fromString: () => ({ value: undefined }),
    toJson: ({ value }) => value,
    fromJson: ({ value }) => value,
  },
});
