import {
  BlockModel,
  BlockSchemaExtension,
  defineBlockSchema,
} from '@blocksuite/store';

import type { ViewBasicDataType } from '../database/types.js';

/**
 * A reference to a single `affine:database` block, addressed by stable id
 * — like `affine:database-ref` (the closest existing precedent, see that
 * package's own model for the shared `refBlockId`/`refDocId`/`caption`
 * shape this duplicates rather than inherits, matching this codebase's
 * established convention of independent schemas per reference flavour) —
 * except this reference owns its own local view/filter configuration
 * instead of mirroring the canonical database's shared `views`.
 *
 * `views` here is intentionally the same loose `ViewBasicDataType` shape
 * `DatabaseBlockProps.views` itself uses, not the richer `DataViewDataType`
 * (filter/sort/columns/etc.) — this package (`@blocksuite/affine-model`)
 * has no dependency on `@blocksuite/data-view` (the reverse dependency
 * direction, `data-view` depending on `model`, is the established one), so
 * the richer shape can only be enforced at the `data-view`-dependent layer
 * (this block's own rendering package), the same way `DatabaseBlockDataSource
 * .viewDataList$` itself only asserts the richer type via a runtime cast
 * over this same loose model-layer type.
 */
export type DatabaseViewRefProps = {
  refBlockId: string;
  refDocId?: string;
  caption: string;
  // This reference's own local view list — never the canonical's. Views
  // added/edited through this reference are stored here, fully decoupled
  // from `DatabaseBlockProps.views` on the canonical and from every other
  // reference to the same canonical (including plain `database-ref`s and
  // other `database-view-ref`s).
  views: ViewBasicDataType[];
  // Which of *this reference's own* `views` is selected — same semantics
  // as `database-ref`'s `currentViewId`, just resolved against `views`
  // above instead of the canonical's.
  currentViewId?: string;
};

export const DatabaseViewRefBlockSchema = defineBlockSchema({
  flavour: 'affine:database-view-ref',
  props: (): DatabaseViewRefProps => ({
    refBlockId: '',
    refDocId: undefined,
    caption: '',
    views: [],
    currentViewId: undefined,
  }),
  metadata: {
    version: 1,
    role: 'content',
    parent: ['affine:note', 'affine:paragraph', 'affine:list'],
  },
  toModel: () => new DatabaseViewRefBlockModel(),
});

export const DatabaseViewRefBlockSchemaExtension = BlockSchemaExtension(
  DatabaseViewRefBlockSchema
);

export class DatabaseViewRefBlockModel extends BlockModel<DatabaseViewRefProps> {}
