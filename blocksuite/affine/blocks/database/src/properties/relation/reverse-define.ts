import { propertyType, t } from '@blocksuite/data-view';
import zod from 'zod';

export const reverseRelationColumnType = propertyType('relation-reverse');

/**
 * The other half of a relation. Nothing is stored here: the rows are found by
 * asking the owning side who points at us, so the two directions cannot drift
 * apart the way two stored arrays would.
 */
export const reverseRelationPropertyModelConfig =
  reverseRelationColumnType.modelConfig({
    name: 'Related',
    propertyData: {
      schema: zod.object({
        sourceDatabaseId: zod.string(),
        sourcePropertyId: zod.string(),
      }),
      default: () => ({ sourceDatabaseId: '', sourcePropertyId: '' }),
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
      fromString: () => ({ value: [] }),
      toJson: ({ value }) => value,
      fromJson: ({ value }) => value,
    },
  });
