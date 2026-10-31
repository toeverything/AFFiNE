import { createIdentifier } from '@blocksuite/global/di';
import type { DeepPartial } from '@blocksuite/global/utils';
import type { ExtensionType } from '@blocksuite/store';
import type { Signal } from '@preact/signals-core';
import { z } from 'zod';

import { NodePropsSchema } from '../utils/index.js';

const TodoFieldDefSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum([
    'text',
    'number',
    'date',
    'select',
    'multi_select',
    'progress',
  ]),
});

export const TaskWorkflowDefaultsSchema = z.object({
  list: z
    .object({
      fieldDefs: z.array(TodoFieldDefSchema).default([]),
      fieldLayout: z.enum(['inline', 'aligned', 'right']).default('aligned'),
      statusMapping: z
        .object({
          statusColumnName: z.string().default('Status'),
          doneTagLabel: z.string().default('Done'),
          notDoneTagLabel: z.string().optional(),
        })
        .default({}),
    })
    .default({}),
  database: z
    .object({
      taskStatusInheritance: z
        .object({
          done: z
            .enum(['require-all-subtasks-complete', 'disabled'])
            .default('require-all-subtasks-complete'),
          inProgress: z
            .enum(['start-when-any-subtask-starts', 'disabled'])
            .default('start-when-any-subtask-starts'),
          autoDemoteAutoDone: z.boolean().default(true),
          cascadeManualDoneToDescendants: z.boolean().default(true),
        })
        .default({}),
      kanbanColumns: z
        .array(z.string())
        .default(['Todo:todo', 'In Progress:in_progress', 'Done:done']),
      // Story 2.7: overdue-and-undone row treatment. `highlight` bolds/
      // colors the row's text while keeping it visible; `hide` excludes it
      // from view; `off` makes no visual change. Per-table override lives
      // on `DatabaseBlockModel.props.highlightAfterDueDateOverride` (see
      // `data-source.ts`'s `getHighlightAfterDueDateSetting`).
      highlightAfterDueDate: z
        .enum(['highlight', 'hide', 'off'])
        .default('highlight'),
      // Story 2.7: global-only (no per-table override, per direct user
      // instruction) — whether a row's calendar entry disappears once its
      // Status is Done.
      hideFromCalendarWhenDone: z.boolean().default(true),
      // Story 2.7: global-only, applied only at column-creation time (see
      // `DatabaseBlockDataSource.ensureDueDateColumn`'s own doc comment for
      // why this is a creation-time default, not a live override) — whether
      // a newly-created Due date column starts visible in table view.
      // Defaults to `false` per direct user instruction: due dates already
      // surface via the row-hover calendar icon and highlight/hide
      // treatment, so the raw column stays out of the way unless someone
      // explicitly wants it (global default here, or per-table via the
      // properties menu regardless of this setting).
      showDueDateColumn: z.boolean().default(false),
    })
    .default({}),
});

export type TaskWorkflowDefaults = z.infer<typeof TaskWorkflowDefaultsSchema>;

export const GeneralSettingSchema = z
  .object({
    edgelessScrollZoom: z.boolean().default(false),
    edgelessDisableScheduleUpdate: z.boolean().default(false),
    edgelessLibraryShapesVisibility: z
      .enum(['disable', 'searchable', 'show'])
      .default('show'),
    edgelessMindmapNextColor: z
      .enum(['disable', 'children', 'depth'])
      .default('children'),
    edgelessMindmapPaletteSize: z
      .enum(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11'])
      .default('11'),
    docCanvasPreferView: z
      .enum(['affine:embed-linked-doc', 'affine:embed-synced-doc'])
      .default('affine:embed-synced-doc'),
    taskWorkflowDefaults: TaskWorkflowDefaultsSchema.default({}),
  })
  .merge(NodePropsSchema);

export type EditorSetting = z.infer<typeof GeneralSettingSchema>;

export interface EditorSettingService {
  setting$: Signal<DeepPartial<EditorSetting>>;
  set?: (
    key: keyof EditorSetting,
    value: EditorSetting[keyof EditorSetting]
  ) => void;
}

export const EditorSettingProvider = createIdentifier<EditorSettingService>(
  'AffineEditorSettingProvider'
);

export function EditorSettingExtension(
  service: EditorSettingService
): ExtensionType {
  return {
    setup: di => {
      di.override(EditorSettingProvider, () => service);
    },
  };
}
