import type { Text } from '@blocksuite/store';
import {
  BlockModel,
  BlockSchemaExtension,
  defineBlockSchema,
} from '@blocksuite/store';

import type {
  ColumnDataType,
  SerializedCells,
  ViewBasicDataType,
} from './types.js';

export type DatabaseBlockProps = {
  views: ViewBasicDataType[];
  title: Text;
  cells: SerializedCells;
  columns: Array<ColumnDataType>;
  comments?: Record<string, boolean>;
  // Which view (by id, into `views`) was last displayed, so a reload shows
  // the same tab instead of always falling back to `views[0]`.
  currentViewId?: string;
  taskStatusInheritance?: {
    done: 'require-all-subtasks-complete' | 'disabled';
    inProgress: 'start-when-any-subtask-starts' | 'disabled';
    autoDemoteAutoDone: boolean;
    cascadeManualDoneToDescendants: boolean;
  };
  taskStatusState?: Record<
    string,
    {
      provenance: 'manual' | 'auto';
      manualLock: 'none' | 'done_locked';
    }
  >;
  // Story 2.7: per-table override of the global "Highlight after due date"
  // editor setting — `undefined` means "follow the live global default",
  // unlike `taskStatusInheritance` above (which is seeded once at creation
  // and never re-reads the global default afterward). See
  // `data-source.ts`'s `getHighlightAfterDueDateSetting`.
  highlightAfterDueDateOverride?: 'highlight' | 'hide' | 'off';
};

export class DatabaseBlockModel extends BlockModel<DatabaseBlockProps> {}

export const DatabaseBlockSchema = defineBlockSchema({
  flavour: 'affine:database',
  props: (internal): DatabaseBlockProps => ({
    views: [],
    title: internal.Text(),
    cells: Object.create(null),
    columns: [],
    comments: undefined,
    currentViewId: undefined,
    taskStatusInheritance: undefined,
    taskStatusState: undefined,
    highlightAfterDueDateOverride: undefined,
  }),
  metadata: {
    role: 'hub',
    version: 3,
    parent: ['affine:note'],
    children: ['affine:paragraph', 'affine:list'],
  },
  toModel: () => new DatabaseBlockModel(),
});

export const DatabaseBlockSchemaExtension =
  BlockSchemaExtension(DatabaseBlockSchema);
