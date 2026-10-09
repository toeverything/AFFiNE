import { propertyType, t } from '@blocksuite/data-view';
import zod from 'zod';

export const relationColumnType = propertyType('relation');

/**
 * A relation points at another database block. For now the target must live in
 * the same doc, which is also how the Notion layout this mirrors is built: all
 * databases stacked on one page. Cross-doc targets would go through
 * `std.workspace.getDoc(id)` and are deliberately out of scope here.
 */
export type RelationPropertyData = {
  targetDatabaseId: string;
};

/** The stored value is the list of row (child block) ids in the target database. */
export const relationPropertyModelConfig = relationColumnType.modelConfig({
  name: 'Relation',
  propertyData: {
    schema: zod.object({ targetDatabaseId: zod.string() }),
    default: () => ({ targetDatabaseId: '' }),
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
    fromString: ({ value }) => ({
      value: value
        .split(',')
        .map(v => v.trim())
        .filter(Boolean),
    }),
    toJson: ({ value }) => value,
    fromJson: ({ value }) => value,
  },
});
