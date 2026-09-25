import { propertyType, t } from '@blocksuite/data-view';
import zod from 'zod';

export const relationFilterColumnType = propertyType('relation-filter');

export const RELATION_CONDITIONS = [
  'checked',
  'unchecked',
  'notEmpty',
  'empty',
  'gte',
  'lt',
] as const;

export type RelationCondition = (typeof RELATION_CONDITIONS)[number];

export type RelationFilterPropertyData = {
  /** The relation on this row to walk. */
  relationPropertyId: string;
  /** The property to test on each linked row. */
  targetPropertyId: string;
  condition: RelationCondition;
  /** Threshold for the numeric conditions; ignored by the rest. */
  threshold: number;
};

/**
 * A relation narrowed by a condition, which is how a "Done Tasks" column shows
 * the finished tasks themselves rather than a count of them.
 */
export const relationFilterPropertyModelConfig =
  relationFilterColumnType.modelConfig({
    name: 'Filtered relation',
    propertyData: {
      schema: zod.object({
        relationPropertyId: zod.string(),
        targetPropertyId: zod.string(),
        condition: zod.enum(RELATION_CONDITIONS),
        threshold: zod.number(),
      }),
      default: () => ({
        relationPropertyId: '',
        targetPropertyId: '',
        condition: 'checked' as const,
        threshold: 100,
      }),
    },
    jsonValue: {
      schema: zod.array(zod.string()),
      type: () => t.array.instance(t.string.instance()),
      isEmpty: ({ value }) => value.length === 0,
    },
    rawValue: {
      schema: zod.array(zod.string()),
      default: () => [],
      toString: ({ value }) => value.join(','),
      // Derived: text can never set it.
      fromString: () => ({ value: [] }),
      toJson: ({ value }) => value,
      fromJson: ({ value }) => value,
    },
  });
