import { toast } from '@blocksuite/affine-components/toast';
import type {
  Color,
  ColumnDataType,
  ColumnUpdater,
  DatabaseBlockModel,
  ListBlockModel,
  ParagraphBlockModel,
  ViewBasicDataType,
} from '@blocksuite/affine-model';
import { resolveColor } from '@blocksuite/affine-model';
import { getSelectedModelsCommand } from '@blocksuite/affine-shared/commands';
import {
  EditorSettingProvider,
  FeatureFlagService,
  JournalTodoDatabaseProvider,
  TaskWorkflowDefaultsSchema,
  ThemeProvider,
} from '@blocksuite/affine-shared/services';
import type { InsertToPosition } from '@blocksuite/affine-shared/utils';
import {
  createDatabaseRowTaskInteropLink,
  createTaskIdentity,
  encodeTaskAncestorIdentities,
  insertPositionToIndex,
  parseTaskIdentity,
  TASK_ANCESTOR_IDENTIFIERS_COLUMN_NAME,
  TASK_HIERARCHY_LEVEL_COLUMN_NAME,
  TASK_PARENT_IDENTIFIER_COLUMN_NAME,
} from '@blocksuite/affine-shared/utils';
import {
  type DatabaseFlags,
  DataSourceBase,
  type DataViewDataType,
  type PropertyMetaConfig,
  type TypeInstance,
  type ViewManager,
  ViewManagerBase,
  type ViewMeta,
} from '@blocksuite/data-view';
import { propertyPresets } from '@blocksuite/data-view/property-presets';
import { IS_MOBILE } from '@blocksuite/global/env';
import { BlockSuiteError, ErrorCode } from '@blocksuite/global/exceptions';
import type { BlockStdScope, EditorHost } from '@blocksuite/std';
import { type BlockModel, nanoid, Text } from '@blocksuite/store';
import { computed, type ReadonlySignal, signal } from '@preact/signals-core';
import { format } from 'date-fns/format';
import { isValid } from 'date-fns/isValid';
import { parse } from 'date-fns/parse';

import { getIcon } from './block-icons.js';
import { EditorHostKey } from './context/host-context.js';
import { DatabaseViewLocalOverrideProvider } from './context/view-local-override-context.js';
import {
  databaseBlockProperties,
  databasePropertyConverts,
} from './properties/index.js';
import type { NoteRefValue } from './properties/note/define.js';
import { notePropertyModelConfig } from './properties/note/define.js';
import {
  addProperty,
  copyCellsByProperty,
  deleteRows,
  deleteView,
  duplicateView,
  getCell,
  getProperty,
  moveViewTo,
  updateCell,
  updateCells,
  updateProperty,
  updateTaskStatusState,
  updateView,
} from './utils/block-utils.js';
import {
  databaseBlockViewConverts,
  databaseBlockViewMap,
  databaseBlockViews,
} from './views/index.js';

// `columns` lives on each concrete view subtype (table/kanban/...), not on
// the generic `ViewBasicDataType`/`DataViewDataType` base every
// `updateView`/`viewDataUpdate` call is typed against by default — used as
// an explicit type argument at call sites below that only ever touch
// `columns`, regardless of which concrete view mode they're running against.
type ViewDataWithColumns = ViewBasicDataType & {
  columns?: Array<{ id: string; width?: number; hide?: boolean }>;
};

/**
 * Local-time `YYYY-MM-DD` formatter — deliberately not `Date#toISOString`
 * (UTC-based, can shift the date across a local midnight boundary). Journal
 * dates are stored/compared in local time throughout this codebase (see
 * `JournalService`'s own `dayjs(...).format('YYYY-MM-DD')` at the app
 * layer); no `dayjs` dependency exists in any blocksuite package, so this
 * is hand-rolled rather than adding one for three lines of formatting.
 */
function formatLocalDate(ms: number): string {
  const date = new Date(ms);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const TASK_INTEROP_COLUMN_ID = '__affine_task_interop_link';
const TASK_DONE_DATE_COLUMN_NAME = 'Done date';
const TASK_DUE_DATE_COLUMN_NAME = 'Due date';
const TASK_NOTE_COLUMN_NAME = 'Note';
const TASK_NOTE_COLOR_COLUMN_NAME = 'Note color';
const READONLY_SYSTEM_COLUMN_NAMES = new Set([
  TASK_HIERARCHY_LEVEL_COLUMN_NAME,
  TASK_PARENT_IDENTIFIER_COLUMN_NAME,
  TASK_ANCESTOR_IDENTIFIERS_COLUMN_NAME,
  TASK_DONE_DATE_COLUMN_NAME,
  TASK_NOTE_COLUMN_NAME,
  TASK_NOTE_COLOR_COLUMN_NAME,
  // `Due date` is deliberately NOT included — Story 2.7 (AC1) requires it
  // to be directly editable via the table cell, unlike every other system
  // column here (auto-managed exclusively by code, never by direct user
  // edit).
]);

const DEFAULT_TASK_STATUS_INHERITANCE = {
  done: 'require-all-subtasks-complete',
  inProgress: 'start-when-any-subtask-starts',
  autoDemoteAutoDone: true,
  cascadeManualDoneToDescendants: true,
} as const;

const DEFAULT_TASK_WORKFLOW_DEFAULTS = TaskWorkflowDefaultsSchema.parse({});

type WorkflowStage = 'no_status' | 'todo' | 'in_progress' | 'review' | 'done';
type WorkflowSemantic = 'none' | 'todo' | 'in_progress' | 'done';
type TodoFieldType =
  | 'text'
  | 'number'
  | 'date'
  | 'select'
  | 'multi_select'
  | 'progress';
type StatusProvenance = 'manual' | 'auto';
type ManualLock = 'none' | 'done_locked';
type StatusOption = {
  id: string;
  value: string;
  color?: string;
  semantic?: WorkflowSemantic;
};
export type TaskStatusInfo = {
  columnId: string;
  selectedOptionId?: string;
  selectedOption?: StatusOption;
  semantic: WorkflowSemantic;
  checked: boolean;
};

const TASK_STATUS_ENGINE_CONFIG = {
  stages: [
    {
      id: 'no_status',
      rank: 0,
      aliases: ['no status', 'none', ''],
    },
    {
      id: 'todo',
      rank: 1,
      aliases: ['todo', 'to do'],
    },
    {
      id: 'in_progress',
      rank: 2,
      aliases: ['in progress', 'in-progress', 'wip', 'doing'],
    },
    {
      id: 'review',
      rank: 3,
      aliases: ['review'],
    },
    {
      id: 'done',
      rank: 4,
      aliases: ['done', 'complete', 'completed'],
    },
  ],
  defaultStage: 'no_status',
  thresholds: {
    inProgressFloor: 'in_progress',
  },
} as const;

const STAGE_RANK: Record<WorkflowStage, number> = {
  no_status: TASK_STATUS_ENGINE_CONFIG.stages.find(v => v.id === 'no_status')
    ?.rank as number,
  todo: TASK_STATUS_ENGINE_CONFIG.stages.find(v => v.id === 'todo')
    ?.rank as number,
  in_progress: TASK_STATUS_ENGINE_CONFIG.stages.find(
    v => v.id === 'in_progress'
  )?.rank as number,
  review: TASK_STATUS_ENGINE_CONFIG.stages.find(v => v.id === 'review')
    ?.rank as number,
  done: TASK_STATUS_ENGINE_CONFIG.stages.find(v => v.id === 'done')
    ?.rank as number,
};

const STAGE_BY_ALIAS = new Map<string, WorkflowStage>(
  TASK_STATUS_ENGINE_CONFIG.stages.flatMap(stage =>
    stage.aliases.map(alias => [alias, stage.id as WorkflowStage])
  )
);

const normalizeWorkflowLabel = (value: string) => value.trim().toLowerCase();

const normalizeWorkflowSemantic = (value: string): WorkflowSemantic | null => {
  const normalized = normalizeWorkflowLabel(value).replaceAll('-', '_');
  if (normalized === 'none' || normalized === 'no_status') {
    return 'none';
  }
  if (normalized === 'todo' || normalized === 'to_do') {
    return 'todo';
  }
  if (
    normalized === 'in_progress' ||
    normalized === 'inprogress' ||
    normalized === 'wip'
  ) {
    return 'in_progress';
  }
  if (
    normalized === 'done' ||
    normalized === 'complete' ||
    normalized === 'completed'
  ) {
    return 'done';
  }
  return null;
};

const semanticToStage = (semantic?: WorkflowSemantic): WorkflowStage | null => {
  if (!semantic || semantic === 'none') {
    return semantic === 'none' ? 'no_status' : null;
  }
  return semantic;
};

const resolveWorkflowStageFromLabel = (label: string): WorkflowStage | null =>
  STAGE_BY_ALIAS.get(normalizeWorkflowLabel(label)) ?? null;

const inferWorkflowSemanticFromLabel = (label: string): WorkflowSemantic => {
  const stage = resolveWorkflowStageFromLabel(label);
  if (stage === 'review') {
    return 'in_progress';
  }
  if (stage === 'todo' || stage === 'in_progress' || stage === 'done') {
    return stage;
  }
  return 'none';
};

const parseWorkflowColumn = (value: string) => {
  const [labelPart = '', semanticPart] = value.split(':');
  const label = labelPart.trim();
  const semantic = semanticPart
    ? (normalizeWorkflowSemantic(semanticPart) ??
      inferWorkflowSemanticFromLabel(label))
    : inferWorkflowSemanticFromLabel(label);
  return { label, semantic };
};

const toWorkflowOptionId = (label: string, semantic: WorkflowSemantic) => {
  const normalizedLabel = normalizeWorkflowLabel(label);
  if (semantic === 'todo' && ['todo', 'to do'].includes(normalizedLabel)) {
    return 'todo';
  }
  if (
    semantic === 'in_progress' &&
    ['in progress', 'in-progress', 'wip', 'doing'].includes(normalizedLabel)
  ) {
    return 'in_progress';
  }
  if (
    semantic === 'done' &&
    ['done', 'complete', 'completed'].includes(normalizedLabel)
  ) {
    return 'done';
  }
  const suffix = normalizedLabel
    .replaceAll(/[^a-z0-9]+/g, '_')
    .replaceAll(/^_+|_+$/g, '');
  return suffix ? `workflow_${suffix}` : `workflow_${semantic}`;
};

const resolveWorkflowStageFromOptionId = (id: string): WorkflowStage | null => {
  if (id === 'not_done') {
    return 'todo';
  }
  return resolveWorkflowStageFromLabel(id);
};

const getStatusOptionColor = (stage: WorkflowStage | null) => {
  switch (stage) {
    case 'done':
      return 'var(--affine-tag-green)';
    case 'in_progress':
      return 'var(--affine-tag-blue)';
    case 'review':
      return 'var(--affine-tag-purple)';
    case 'todo':
    default:
      return 'var(--affine-tag-yellow)';
  }
};

export const createTaskWorkflowStatusOptions = (
  taskWorkflowDefaults: ReturnType<typeof TaskWorkflowDefaultsSchema.parse>,
  doneTagLabel: string
) => {
  const columns = taskWorkflowDefaults.database.kanbanColumns
    .map(parseWorkflowColumn)
    .filter(column => column.label);
  const fallbackColumns = DEFAULT_TASK_WORKFLOW_DEFAULTS.database.kanbanColumns
    .map(parseWorkflowColumn)
    .filter(column => column.label);
  const seenIds = new Set<string>();
  const options: Array<StatusOption & { color: string }> = [];

  for (const { label, semantic } of columns.length > 0
    ? columns
    : fallbackColumns) {
    const stage = semanticToStage(semantic);
    const id = toWorkflowOptionId(label, semantic);
    if (seenIds.has(id)) {
      continue;
    }
    seenIds.add(id);
    options.push({
      id,
      value: id === 'done' ? doneTagLabel || label || 'Done' : label,
      color: getStatusOptionColor(stage),
      semantic,
    });
  }

  if (!seenIds.has('done')) {
    options.push({
      id: 'done',
      value: doneTagLabel || 'Done',
      color: getStatusOptionColor('done'),
      semantic: 'done',
    });
  }

  return options;
};

export const parseTaskDateFieldValue = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== 'string') {
    return undefined;
  }
  const raw = value.trim();
  const normalized = /^\d{4}\/\d{2}\/\d{2}$/.test(raw)
    ? raw.replaceAll('/', '-')
    : raw;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return undefined;
  }
  const date = parse(normalized, 'yyyy-MM-dd', new Date());
  if (!isValid(date)) {
    return undefined;
  }
  return format(date, 'yyyy-MM-dd') === normalized ? +date : undefined;
};

export type TaskIdentityRowLookup =
  | { status: 'unique'; rowId: string }
  | { status: 'missing' }
  | { status: 'duplicate'; rowIds: [string, string] };

type SpacialProperty = {
  valueSet: (rowId: string, propertyId: string, value: unknown) => void;
  valueGet: (rowId: string, propertyId: string) => unknown;
};

export class DatabaseBlockDataSource extends DataSourceBase {
  private readonly _pendingHierarchyLevelByRowId = new Map<string, number>();
  private readonly _pendingHierarchyMoveByRowId = new Map<
    string,
    { movedRowIds: string[]; oldRootLevel: number }
  >();

  setPendingHierarchyLevel(rowId: string, level: number) {
    if (!Number.isFinite(level)) {
      this._pendingHierarchyLevelByRowId.delete(rowId);
      return;
    }
    this._pendingHierarchyLevelByRowId.set(
      rowId,
      Math.max(0, Math.floor(level))
    );
  }

  private parseHierarchyLevel(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.max(0, Math.floor(value));
    }
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return Math.max(0, Math.floor(parsed));
      }
    }
    return 0;
  }

  getRowHierarchyLevel(rowId: string): number {
    const column = this._model.props.columns.find(
      column => column.name === TASK_HIERARCHY_LEVEL_COLUMN_NAME
    );
    if (!column) {
      return 0;
    }
    return this.parseHierarchyLevel(
      getCell(this._model, rowId, column.id)?.value
    );
  }

  getTaskStatusInheritance() {
    return {
      done:
        this._model.props.taskStatusInheritance?.done ??
        DEFAULT_TASK_STATUS_INHERITANCE.done,
      inProgress:
        this._model.props.taskStatusInheritance?.inProgress ??
        DEFAULT_TASK_STATUS_INHERITANCE.inProgress,
      autoDemoteAutoDone:
        this._model.props.taskStatusInheritance?.autoDemoteAutoDone ??
        DEFAULT_TASK_STATUS_INHERITANCE.autoDemoteAutoDone,
      cascadeManualDoneToDescendants:
        this._model.props.taskStatusInheritance
          ?.cascadeManualDoneToDescendants ??
        DEFAULT_TASK_STATUS_INHERITANCE.cascadeManualDoneToDescendants,
    };
  }

  setTaskStatusInheritance(next: {
    done?: 'require-all-subtasks-complete' | 'disabled';
    inProgress?: 'start-when-any-subtask-starts' | 'disabled';
    autoDemoteAutoDone?: boolean;
    cascadeManualDoneToDescendants?: boolean;
  }) {
    const current = this.getTaskStatusInheritance();
    const resolved = {
      done: next.done ?? current.done,
      inProgress: next.inProgress ?? current.inProgress,
      autoDemoteAutoDone: next.autoDemoteAutoDone ?? current.autoDemoteAutoDone,
      cascadeManualDoneToDescendants:
        next.cascadeManualDoneToDescendants ??
        current.cascadeManualDoneToDescendants,
    };
    this.doc.captureSync();
    let doneStamps: Record<string, boolean> = {};
    this._model.store.transact(() => {
      this._model.props.taskStatusInheritance = resolved;
      doneStamps = this.recomputeAllParentStatusesFromChildren();
    });
    for (const [rowId, isDone] of Object.entries(doneStamps)) {
      this.stampDoneDateForRow(rowId, isDone);
    }
  }

  getTaskStatusColumn() {
    return this.getTaskStatusColumns()[0];
  }

  getTaskStatusInfo(rowId: string, propertyId?: string): TaskStatusInfo | null {
    const column = propertyId
      ? this._model.props.columns.find(
          column => column.id === propertyId && this.isTaskStatusColumn(column)
        )
      : this.getTaskStatusColumn();
    if (!column) {
      return null;
    }

    const options = this.getTaskStatusOptions(column);
    const optionById = new Map(options.map(option => [option.id, option]));
    const selectedOptionId = this.resolveSelectStatusValue(
      getCell(this._model, rowId, column.id)?.value
    );
    const selectedOption = selectedOptionId
      ? optionById.get(selectedOptionId)
      : undefined;
    const semantic = this.resolveWorkflowSemanticFromOption(selectedOption);

    return {
      columnId: column.id,
      selectedOptionId,
      selectedOption,
      semantic,
      checked: semantic === 'done',
    };
  }

  getTaskStatusTargetOption(
    semantic: WorkflowSemantic,
    propertyId?: string
  ): StatusOption | undefined {
    const column = propertyId
      ? this._model.props.columns.find(
          column => column.id === propertyId && this.isTaskStatusColumn(column)
        )
      : this.getTaskStatusColumn();
    if (!column) {
      return undefined;
    }
    const targetStage = semanticToStage(semantic);
    return this.getTaskStatusOptions(column).find(
      option => this.resolveWorkflowStageFromOption(option) === targetStage
    );
  }

  setTaskStatusChecked(rowId: string, checked: boolean, propertyId?: string) {
    const target = this.getTaskStatusTargetOption(
      checked ? 'done' : 'todo',
      propertyId
    );
    if (!target) {
      return;
    }
    const column = propertyId
      ? this._model.props.columns.find(
          column => column.id === propertyId && this.isTaskStatusColumn(column)
        )
      : this.getTaskStatusColumn();
    if (!column) {
      return;
    }
    this.cellValueChange(rowId, column.id, target.id);
  }

  /**
   * Stamps (or clears) the hidden "Done date" column for a single row —
   * the one, centralized place every task-status-changing code path in
   * this file routes through, so a row's Done date always reflects its
   * true current done/not-done state, however that state was reached.
   * Previously this only ran inside `setTaskStatusChecked` itself, which
   * missed every other way a row's status can change: a parent
   * auto-promoted/demoted by `recomputeParentStatusesFromChildren`, a
   * descendant auto-cascaded by `cascadeStatusToDescendants`, or a plain
   * cell edit through the generic property editor (`cellValueChange` is
   * also called directly by `core/view-manager/cell.ts`, not only via
   * `setTaskStatusChecked`) — in each of those cases the row's Status
   * cell changed but its Done date silently never did, so a task that
   * became done via cascade or direct edit could immediately fail the
   * Journal Todo view's `OR(isNotOneOf(done), after(doneDate, ...))`
   * filter on both branches and vanish, even though it was never
   * explicitly checked off by the user in that view.
   */
  private stampDoneDateForRow(rowId: string, isDone: boolean) {
    const doneDateColumnId = this.ensureDoneDateColumn();
    if (!doneDateColumnId) {
      return;
    }
    updateCell(this._model, rowId, {
      columnId: doneDateColumnId,
      value: isDone ? Date.now() : null,
    });
  }

  getTodoListRowChecked(rowId: string): boolean | undefined {
    const model = this.getModelById(rowId) as ListBlockModel | null;
    if (model?.flavour !== 'affine:list' || model.props.type !== 'todo') {
      return undefined;
    }
    // `.checked$.value` (not the plain `.checked`) — this is read from a
    // Lit `render()` tracked by `SignalWatcher` (`HeaderAreaTextCell`'s
    // `renderTaskStatusCheckbox`), and only a `$`-suffixed signal read
    // registers as a tracked dependency; a plain prop read is invisible to
    // that tracking, so a `setTodoListRowChecked` write elsewhere never
    // triggered a re-render — the checkbox only ever reflected whatever
    // value happened to be current the last time something else forced a
    // render pass (e.g. navigating away and back). `list-block.ts` already
    // uses `.checked$.value` for this exact reason in its own render path.
    return Boolean(model.props.checked$.value);
  }

  setTodoListRowChecked(rowId: string, checked: boolean) {
    const model = this.getModelById(rowId) as ListBlockModel | null;
    if (model?.flavour !== 'affine:list' || model.props.type !== 'todo') {
      return;
    }
    this.doc.captureSync();
    this.doc.updateBlock(model as ListBlockModel, { checked });
  }

  /**
   * Hides Hierarchy Level/Parent Identifier/Ancestor Identifiers (always)
   * and Status/Done date (everywhere *except* table view — both are real,
   * directly-useful properties there, unlike in list/kanban where the
   * checkbox/card-column position already represents done-ness) —
   * whichever of these already exist as real columns — in one specific,
   * just-created view. `hidePropertyInViews` (below) only ever hides a
   * column in the views that already existed *at the moment that column
   * was created* — a view added afterwards (e.g. a List view added to a
   * database that already has todo rows and therefore an existing Status
   * column) starts with its own fresh `columns` snapshot with no `hide`
   * entries at all, so these would show up as ordinary, visible
   * properties in that new view by default. Called for every new view —
   * both the canonical database's own (`viewDataAdd`/
   * `viewDataAddWithoutCapture`'s non-override branch) and a
   * `database-view-ref` instance's own per-instance view (same two
   * methods' override branch) — since `hidePropertyInViews`/
   * `hidePropertyInOneView` route through the override-aware
   * `viewDataList$`/`viewDataUpdate` rather than reading/writing
   * `this._model.props.views` directly.
   */
  private hideDefaultHiddenColumnsForNewView(viewId: string) {
    const view = this.viewDataList$.value.find(v => v.id === viewId);
    if (!view) {
      return;
    }
    const alwaysHiddenNames = [
      TASK_HIERARCHY_LEVEL_COLUMN_NAME,
      TASK_PARENT_IDENTIFIER_COLUMN_NAME,
      TASK_ANCESTOR_IDENTIFIERS_COLUMN_NAME,
      // `Note color` is pure plumbing (Story 2.6, resolved-color cache) —
      // hidden in every view including table, no user-facing affordance at
      // all. `Note` itself is NOT always-hidden (see below): table has no
      // row-hover affordance, so the column is the only way to reach it
      // there.
      TASK_NOTE_COLOR_COLUMN_NAME,
    ];
    // Story 2.7 (post-Task-3a live feedback, second round): "Journal Todo"
    // is a *list*-mode view — the "Show 'Due date' in Journal todo" setting
    // literally names that surface, not some separate table view most
    // users never look at. Unlike Status/Done date/Note (which have real,
    // always-available alternate representations in list/kanban — a
    // checkbox, a row-hover button — so hiding their raw column there is
    // never a loss), Due date's own list-mode representation *is* this
    // very setting: on, it shows as a normal inline field (`renderCell`/
    // `renderDetailValue`, same as any other visible property); off, the
    // row-hover calendar icon (Task 3a) remains the only way to set it,
    // exactly matching the setting's own name and the user's own repeated
    // expectation. So the setting now gates Due date's hide state in
    // *every* view mode uniformly, not just table.
    const showDueDate = this.getShowDueDateColumnSetting(
      this.serviceGet(EditorHostKey)?.std
    );
    const namesToHide =
      view.mode === 'table'
        ? // This is the mechanism that applies on *every* new view creation
          // (canonical's own AND, critically, a reference's own local view
          // added via the generic view-switcher, since this method runs on
          // whichever `DatabaseBlockDataSource` instance the view was
          // created through — see `viewDataAdd`/`viewDataAddWithoutCapture`
          // above). `ensureDueDateColumn`'s own creation-time hide only
          // covers the narrower case of a view that already existed
          // *before* the column itself did; this covers every other case.
          showDueDate
          ? alwaysHiddenNames
          : [...alwaysHiddenNames, this.getDueDateColumn()?.name].filter(
              (name): name is string => !!name
            )
        : [
            ...alwaysHiddenNames,
            TASK_NOTE_COLUMN_NAME,
            this.getTaskStatusColumn()?.name,
            this.getDoneDateColumn()?.name,
            ...(showDueDate ? [] : [this.getDueDateColumn()?.name]),
          ].filter((name): name is string => !!name);
    const columnIds = this._model.props.columns
      .filter(column => namesToHide.includes(column.name))
      .map(column => column.id);
    if (columnIds.length === 0) {
      return;
    }
    this.hidePropertyInViews(columnIds, [viewId]);
  }

  /**
   * Re-applies the *unconditionally* hidden plumbing columns to every view
   * this data source can see — not just to views being created right now.
   *
   * Story 2.11 (live bug report, third follow-up — the "Note color field is
   * visibly exposed" half of the auto-selected-today report): the four
   * columns below have no user-facing affordance at all, so there is no
   * legitimate state in which any view shows them. Yet two existing
   * mechanisms between them still leave gaps, because `Note color` — unlike
   * Hierarchy Level/Parent/Ancestor and unlike Status/Done date/Note/Due
   * date — is created *lazily*, the first time any row anywhere gets a
   * colour attached (`ensureNoteColorColumn`):
   *
   *  - `hideDefaultHiddenColumnsForNewView` only runs when a view is
   *    *created*, so it cannot help a view that already existed before the
   *    column did.
   *  - `ensureNoteColorColumn`'s own `hidePropertyInViews` runs on whichever
   *    `DatabaseBlockDataSource` instance did the attaching, and that routes
   *    through the override-aware `viewDataList$`/`viewDataUpdate` — so it
   *    reaches only *that* reference's own views. Every other reference to
   *    the same canonical table (every other day's journal, the journal
   *    template itself) keeps a view with no `hide` entry for it.
   *
   * So on the first-ever note-colour attach, every already-created Journal
   * Todo reference starts rendering `Note color` as an ordinary visible
   * field, with nothing that would ever revisit it — matching the user's
   * report that it never self-heals and that adding a fresh, correct Journal
   * Todo alongside it does not fix the original. Enforcing the invariant per
   * data source, once, on construction makes every reference self-correct the
   * next time it renders.
   *
   * Deliberately limited to these four: Status/Done date/Note/Due date are
   * *conditionally* hidden (by view mode, or by the "Show Due date" setting)
   * and a user can legitimately have them visible, so re-stamping those
   * would override real user intent.
   */
  enforceAlwaysHiddenPlumbingColumns() {
    const alwaysHiddenNames = new Set([
      TASK_HIERARCHY_LEVEL_COLUMN_NAME,
      TASK_PARENT_IDENTIFIER_COLUMN_NAME,
      TASK_ANCESTOR_IDENTIFIERS_COLUMN_NAME,
      TASK_NOTE_COLOR_COLUMN_NAME,
    ]);
    const columnIds = this._model.props.columns
      .filter(column => alwaysHiddenNames.has(column.name))
      .map(column => column.id);
    if (columnIds.length === 0) {
      return;
    }
    for (const view of this.viewDataList$.value) {
      const columns = (view as ViewDataWithColumns).columns ?? [];
      // Only write when something actually needs changing.
      // `hidePropertyInOneView` rebuilds the `columns` array even when the
      // entry is already `hide: true`, and this runs during a render path —
      // an unguarded write would be a redundant Yjs update every mount.
      const needHiding = columnIds.filter(
        id => columns.find(column => column.id === id)?.hide !== true
      );
      for (const id of needHiding) {
        this.hidePropertyInOneView(view.id, view.mode, id);
      }
    }
  }

  private hidePropertyInViews(columnId: string | string[], viewIds?: string[]) {
    const columnIds = Array.isArray(columnId) ? columnId : [columnId];
    const views = viewIds
      ? this.viewDataList$.value.filter(view => viewIds.includes(view.id))
      : this.viewDataList$.value;
    for (const view of views) {
      for (const id of columnIds) {
        this.hidePropertyInOneView(view.id, view.mode, id);
      }
    }
  }

  private hidePropertyInOneView(
    viewId: string,
    viewMode: string,
    columnId: string
  ) {
    if (viewMode === 'table') {
      this.viewDataUpdate<ViewDataWithColumns>(viewId, data => {
        const columns = data.columns ?? [];
        const idx = columns.findIndex(column => column.id === columnId);
        if (idx >= 0) {
          const current = columns[idx];
          if (!current) return {};
          const next = [...columns];
          next[idx] = { ...current, hide: true };
          return { columns: next };
        }
        return {
          columns: [...columns, { id: columnId, width: 180, hide: true }],
        };
      });
      return;
    }

    this.viewDataUpdate<ViewDataWithColumns>(viewId, data => {
      const columns = data.columns ?? [];
      const idx = columns.findIndex(column => column.id === columnId);
      if (idx >= 0) {
        const current = columns[idx];
        if (!current) return {};
        const next = [...columns];
        next[idx] = { ...current, hide: true };
        return { columns: next };
      }
      return { columns: [...columns, { id: columnId, hide: true }] };
    });
  }

  ensureTaskHierarchyColumns() {
    const getOrAdd = (
      name: string,
      create: () => Omit<ColumnDataType, 'id'>
    ): string | undefined => {
      const existing = this._model.props.columns.find(
        column => column.name === name
      );
      if (existing) {
        return existing.id;
      }
      const columnId = addProperty(this._model, 'end', create());
      this.hidePropertyInViews(columnId);
      return columnId;
    };
    return {
      levelColumnId: getOrAdd(TASK_HIERARCHY_LEVEL_COLUMN_NAME, () =>
        databaseBlockProperties.numberColumnConfig.create(
          TASK_HIERARCHY_LEVEL_COLUMN_NAME
        )
      ),
      parentColumnId: getOrAdd(TASK_PARENT_IDENTIFIER_COLUMN_NAME, () =>
        databaseBlockProperties.richTextColumnConfig.create(
          TASK_PARENT_IDENTIFIER_COLUMN_NAME
        )
      ),
      ancestorColumnId: getOrAdd(TASK_ANCESTOR_IDENTIFIERS_COLUMN_NAME, () =>
        databaseBlockProperties.richTextColumnConfig.create(
          TASK_ANCESTOR_IDENTIFIERS_COLUMN_NAME
        )
      ),
    };
  }

  /**
   * Ensures a task-status "Status" select column exists — Status is meant
   * to be the single, always-present source of truth for a todo row's
   * done/in-progress/todo state (this is what `getTaskStatusInfo`/
   * `setTaskStatusChecked`/`recomputeParentStatusesFromChildren`'s whole
   * cascade/auto-promotion system is built around). Previously this column
   * only ever got created as a side effect of `databaseViewInitTemplate`'s
   * kanban/list branch, or Kanban's own `ensureKanbanGroupColumn` fallback
   * — meaning a database whose only view was ever "table", or whose rows
   * were added via `rowAddAsTodoList`/`ensureRowAsTodoList` directly, could
   * have live todo rows with no Status column at all, silently falling
   * back to `affine:list`'s own plain `checked` boolean
   * (`getTodoListRowChecked`/`setTodoListRowChecked`) — a completely
   * separate, non-cascading, non-Kanban-groupable storage mechanism that
   * never seemed intentional; the two-mechanism split is what produced the
   * inconsistent behavior (auto-promotion working only once a Status
   * column happened to exist, checked-state tracked differently
   * depending on which mechanism was live). Called the same way
   * `ensureTaskHierarchyColumns` already is — eagerly, the moment a todo
   * row is created — so a Status column exists from the very first todo
   * row, exactly like the hierarchy columns do.
   */
  ensureTaskStatusColumn(): string | undefined {
    const existing = this.getTaskStatusColumn();
    if (existing) {
      return existing.id;
    }
    const taskWorkflowDefaults = DEFAULT_TASK_WORKFLOW_DEFAULTS;
    const statusColumnId = this.propertyAdd('end', {
      type: 'select',
      name:
        taskWorkflowDefaults.list.statusMapping.statusColumnName || 'Status',
    });
    if (statusColumnId) {
      this.propertyDataSet(statusColumnId, {
        options: createTaskWorkflowStatusOptions(
          taskWorkflowDefaults,
          taskWorkflowDefaults.list.statusMapping.doneTagLabel
        ),
      });
      // Hidden by default in every *non-table* view that already exists
      // (toggleable back on via the properties panel) — Status backs the
      // task-workflow cascade/Kanban groupBy and is redundant there (the
      // checkbox/card-column position already shows it), but in table
      // view it's a real, directly useful property and should stay
      // visible.
      const nonTableViewIds = this.viewDataList$.value
        .filter(view => view.mode !== 'table')
        .map(view => view.id);
      if (nonTableViewIds.length > 0) {
        this.hidePropertyInViews(statusColumnId, nonTableViewIds);
      }
    }
    return statusColumnId;
  }

  getDoneDateColumn(): ColumnDataType | undefined {
    return this._model.props.columns.find(
      column => column.name === TASK_DONE_DATE_COLUMN_NAME
    );
  }

  /**
   * Ensures a "Done date" Date column exists — records the timestamp a row
   * was last marked done (cleared back to `null` if un-done), auto-managed
   * exclusively by `setTaskStatusChecked` (never directly editable, see
   * `READONLY_SYSTEM_COLUMN_NAMES`). Visibility follows the exact same
   * policy as the Status column: hidden by default in every *non-table*
   * view (redundant there, filter-construction-only metadata), but visible
   * in table view where it's a real, directly-useful property.
   */
  ensureDoneDateColumn(): string | undefined {
    const existing = this.getDoneDateColumn();
    if (existing) {
      return existing.id;
    }
    const columnId = addProperty(
      this._model,
      'end',
      databaseBlockProperties.dateColumnConfig.create(
        TASK_DONE_DATE_COLUMN_NAME
      )
    );
    const nonTableViewIds = this.viewDataList$.value
      .filter(view => view.mode !== 'table')
      .map(view => view.id);
    if (nonTableViewIds.length > 0) {
      this.hidePropertyInViews(columnId, nonTableViewIds);
    }
    return columnId;
  }

  getDueDateColumn(): ColumnDataType | undefined {
    return this._model.props.columns.find(
      column => column.name === TASK_DUE_DATE_COLUMN_NAME
    );
  }

  /**
   * Story 2.7: whether the Due date column should currently be shown.
   * Public (unlike most of this file's other settings getters) because it
   * has two consumers with two different timing needs: (1)
   * `ensureDueDateColumn`/`hideDefaultHiddenColumnsForNewView` read it once
   * at column/view-creation time to set the persisted `hide` flag — a
   * *default*, not a live binding, exactly like every other creation-time
   * default in this file; (2) `list/pc/renderer.ts`'s row-level rendering
   * (Story 2.7, live-render fix) reads it **fresh on every render**,
   * mirroring `getDueDateHighlightState`'s own already-proven live pattern,
   * and uses it to force Due date into `detailProperties` regardless of
   * the persisted flag — this is the belt-and-suspenders fix for a
   * confirmed-live bug where the persisted flag alone wasn't reliably
   * reflecting the setting for a `/Journal Todo`-inserted list (the
   * creation-time write happens deep inside a `Command` handler, whose
   * `ctx.std` binding could not be conclusively verified to carry
   * `EditorSettingProvider` in every context — the render-time path is the
   * one already known to work correctly everywhere).
   */
  getShowDueDateColumnSetting(std?: BlockStdScope): boolean {
    // `.value`, not `.peek()` — this is read from a render tracked by Lit's
    // `SignalWatcher` (`list/pc/renderer.ts`'s `render()`), and only a
    // `.value` read registers as a tracked dependency; `.peek()` is
    // invisible to that tracking, so a setting change elsewhere never
    // triggered a re-render here (confirmed live: the setting only took
    // effect after a page change/reload, never on an already-open list).
    const taskWorkflowDefaults = TaskWorkflowDefaultsSchema.parse(
      std?.getOptional(EditorSettingProvider)?.setting$.value
        ?.taskWorkflowDefaults ?? {}
    );
    return taskWorkflowDefaults.database.showDueDateColumn;
  }

  /**
   * Ensures a "Due date" Date column exists — Story 2.7. Unlike Done date,
   * this is a *user-set* value (directly editable via the table cell, see
   * `READONLY_SYSTEM_COLUMN_NAMES` above), not auto-managed. Positioned
   * right after Done date in the master column order (`{id:
   * doneDateColumnId, before: false}`, not `'end'`), so it lands correctly
   * in table view the first time without any of the two-wrong-turns
   * history Note's own column went through in Story 2.6 (see that story's
   * Change Log).
   *
   * Visibility across every existing view (table, list, kanban alike) is a
   * **creation-time-only** default — controlled by `showDueDateColumn`
   * (global setting, default `false`) — applied once, here, when the
   * column is first created, and never touched again on subsequent calls
   * (this method early-returns for an already-existing column, same
   * pattern every other `ensure*Column` method in this file uses).
   * Deliberately not a live/reactive override: a view whose owner manually
   * shows/hides the column afterward (via the standard properties menu,
   * per Resolved Design Decision 2) must have that choice stick —
   * re-syncing to the global default on every `/Journal Todo` invocation
   * or due-date edit would silently stomp it. (A genuinely new view
   * created *after* the column already exists is handled separately, by
   * `hideDefaultHiddenColumnsForNewView`.)
   */
  ensureDueDateColumn(std?: BlockStdScope): string | undefined {
    const existing = this.getDueDateColumn();
    if (existing) {
      return existing.id;
    }
    const doneDateColumnId = this.ensureDoneDateColumn();
    const columnId = addProperty(
      this._model,
      doneDateColumnId ? { id: doneDateColumnId, before: false } : 'end',
      databaseBlockProperties.dateColumnConfig.create(TASK_DUE_DATE_COLUMN_NAME)
    );
    if (!this.getShowDueDateColumnSetting(std)) {
      const allViewIds = this.viewDataList$.value.map(view => view.id);
      if (allViewIds.length > 0) {
        this.hidePropertyInViews(columnId, allViewIds);
      }
    }
    return columnId;
  }

  /**
   * Story 2.7 (Task 3): reads this row's current Due date (epoch ms), or
   * `undefined` if unset / the column doesn't exist yet on this table.
   */
  getDueDateForRow(rowId: string): number | undefined {
    const columnId = this.getDueDateColumn()?.id;
    if (!columnId) return undefined;
    const value = getCell(this._model, rowId, columnId)?.value;
    return typeof value === 'number' ? value : undefined;
  }

  /**
   * Story 2.7 (Task 3): writes (or clears, via `undefined`) this row's Due
   * date from the row-hover calendar icon — ensures the column exists
   * first (defensive: a table reached without ever going through
   * `/Journal Todo`'s own eager-ensure could otherwise silently no-op).
   * `std` is threaded through to `ensureDueDateColumn` purely for the
   * creation-time visibility default — irrelevant if the column already
   * exists.
   */
  setDueDateForRow(
    std: BlockStdScope,
    rowId: string,
    value: number | undefined
  ) {
    const columnId = this.ensureDueDateColumn(std);
    if (!columnId) {
      toast(std.host, 'Could not set a due date here.');
      return;
    }
    updateCell(this._model, rowId, { columnId, value: value ?? null });
  }

  getNoteColumn(): ColumnDataType | undefined {
    return this._model.props.columns.find(
      column => column.name === TASK_NOTE_COLUMN_NAME
    );
  }

  /**
   * Ensures a `note` reference column exists — Story 2.6. Visibility
   * follows the exact same policy as Status/Done date (`ensureTaskStatus
   * Column`/`ensureDoneDateColumn` above): hidden by default in every
   * *non-table* view (redundant there — the row-hover button in
   * `list/pc/renderer.ts`'s `renderNoteAction` is the real affordance), but
   * visible in table view, where there is no row-hover affordance built and
   * the column is the only way to reach the feature. Deliberately does
   * *not* write any explicit per-view entry for table views (same as
   * Status/Done date) — table's own `TableSingleView` materializes any
   * not-yet-listed property into view automatically, in the data source's
   * own column order, the moment the view is actually opened
   * (`table-view-manager.ts`'s `materializeColumns`), so positioning Note
   * right after Status in the *master* column order below (rather than
   * 'end') is what actually determines where it lands — writing an
   * explicit table-view entry ourselves would freeze Note at whatever
   * incidental position it was written at instead, which is exactly the
   * live bug this replaced (Note was previously always force-hidden via a
   * no-view-filter `hidePropertyInViews` call, which — for table views
   * lacking any other explicit entries yet — planted Note's own entry as
   * the very first stored column).
   *
   * Also strips any stale explicit table-view entry left over by that old
   * behavior on a document created before this fix, every time this runs
   * (cheap no-op once cleaned), so an already-broken table self-heals the
   * next time `/Journal Todo` resolves it rather than staying stuck.
   */
  ensureNoteColumn(): string | undefined {
    let columnId = this.getNoteColumn()?.id;
    if (!columnId) {
      const statusColumnId = this.getTaskStatusColumn()?.id;
      columnId = addProperty(
        this._model,
        statusColumnId ? { id: statusColumnId, before: false } : 'end',
        notePropertyModelConfig.create(TASK_NOTE_COLUMN_NAME)
      );
      const nonTableViewIds = this.viewDataList$.value
        .filter(view => view.mode !== 'table')
        .map(view => view.id);
      if (nonTableViewIds.length > 0) {
        this.hidePropertyInViews(columnId, nonTableViewIds);
      }
    }
    this.clearStaleTableColumnEntry(columnId);
    return columnId;
  }

  /**
   * Removes a column's own explicit entry from every TABLE-mode view's
   * `columns` order array, if one exists — used to undo a stale `hide:
   * true`/mis-positioned entry left over from before a column's visibility
   * policy changed (see `ensureNoteColumn` above), letting
   * `materializeColumns`'s own not-yet-listed-property fallback re-place it
   * correctly (by master column order) the next time the view is opened.
   * No-ops (no Yjs write) if the view has no entry for this column already.
   */
  private clearStaleTableColumnEntry(columnId: string) {
    for (const view of this.viewDataList$.value) {
      if (view.mode !== 'table') continue;
      const data = this.viewDataGet(view.id) as unknown as
        | { columns?: { id: string }[] }
        | undefined;
      const columns = data?.columns ?? [];
      if (!columns.some(c => c.id === columnId)) {
        continue;
      }
      this.viewDataUpdate<ViewDataWithColumns>(view.id, () => ({
        columns: columns.filter(c => c.id !== columnId),
      }));
    }
  }

  getNoteColorColumn(): ColumnDataType | undefined {
    return this._model.props.columns.find(
      column => column.name === TASK_NOTE_COLOR_COLUMN_NAME
    );
  }

  /**
   * Ensures a hidden "Note color" column exists — pure implementation
   * plumbing (the resolved color a row's attached note was seeded with;
   * independent of the note's own `pageBackgroundOverride` after creation,
   * see `pickNoteColor`'s own doc comment), never meant to be a
   * user-visible column. Hidden in *every* view including table (the
   * no-`viewIds`-filter form of `hidePropertyInViews`, the same call
   * `ensureTaskHierarchyColumns`'s own `getOrAdd` already uses to hide a
   * column everywhere) — unlike Done date, which stays visible in table.
   *
   * Unlike Note/Due date/Done date/Status (all eagerly ensured on *every*
   * `/Journal Todo` invocation in `slash-menu.ts`, so `hideDefaultHidden
   * ColumnsForNewView` always sees them already existing by the time each
   * reference's own view is created), this column only ever comes into
   * existence lazily, the first time *any* row anywhere gets a note
   * attached — there's no equivalent eager-ensure call for it, since
   * creating it before any note exists would be pointless plumbing.
   * Previously the `hidePropertyInViews` call below only ran inside the
   * "just created it" branch, so only the *one* reference whose own note
   * -attach action happened to be the very first one ever, globally, got
   * it hidden in its own view — every other reference (a different
   * manually-created table, or the same table's own view on a different
   * day) that later attached a note to one of *its* rows found the column
   * already existing and skipped straight past the hide entirely, leaving
   * it visible there. Re-running the hide unconditionally, every time any
   * reference calls this, fixes that: cheap (a handful of already-hidden
   * no-op writes) and correct regardless of which reference happens to
   * create the column first.
   */
  ensureNoteColorColumn(): string | undefined {
    const existing = this.getNoteColorColumn();
    const columnId =
      existing?.id ??
      addProperty(
        this._model,
        'end',
        databaseBlockProperties.richTextColumnConfig.create(
          TASK_NOTE_COLOR_COLUMN_NAME
        )
      );
    this.hidePropertyInViews(columnId);
    return columnId;
  }

  getNoteRef(rowId: string): NoteRefValue | undefined {
    const columnId = this.getNoteColumn()?.id;
    if (!columnId) return undefined;
    return getCell(this._model, rowId, columnId)?.value as
      | NoteRefValue
      | undefined;
  }

  setNoteRef(rowId: string, value: NoteRefValue): void {
    const columnId = this.ensureNoteColumn();
    if (!columnId) return;
    updateCell(this._model, rowId, { columnId, value });
  }

  /**
   * `Note color` stores a JSON-serialized theme `Color` token (e.g.
   * `{dark, light}`), never a resolved CSS string — the same reasoning as
   * `NoteRefProps.backgroundOverride` (see `properties/note/actions.ts`'s
   * `pickNoteColor`): resolving eagerly would bake in whichever scheme was
   * active at pick time, leaving the row's own background stuck on the
   * wrong scheme after a theme switch. The underlying cell is still a
   * plain rich-text column (`Text`) — only the string it holds changed
   * from a bare hex value to a JSON blob.
   */
  getNoteColor(rowId: string): Color | undefined {
    const columnId = this.getNoteColorColumn()?.id;
    if (!columnId) return undefined;
    const value = getCell(this._model, rowId, columnId)?.value as
      | { toString(): string }
      | undefined;
    const raw = value?.toString();
    if (!raw) return undefined;
    try {
      return JSON.parse(raw) as Color;
    } catch {
      return undefined;
    }
  }

  setNoteColor(rowId: string, color: Color): void {
    const columnId = this.ensureNoteColorColumn();
    if (!columnId) return;
    updateCell(this._model, rowId, {
      columnId,
      value: new Text(JSON.stringify(color)),
    });
  }

  /**
   * Every currently-assigned Note color in this table, used by
   * `pickNoteColor` to avoid handing out a color already in use by another
   * row on this same page — Story 2.6's Resolved Design Decision 7.
   */
  getAllNoteColors(): Color[] {
    const columnId = this.getNoteColorColumn()?.id;
    if (!columnId) return [];
    return this._model.children
      .map(row => {
        const value = getCell(this._model, row.id, columnId)?.value;
        const raw = value?.toString();
        if (!raw) return undefined;
        try {
          return JSON.parse(raw) as Color;
        } catch {
          return undefined;
        }
      })
      .filter((color): color is Color => !!color);
  }

  /**
   * Thin delegates to whatever `@blocksuite/affine-block-database-note-property`
   * registers into `noteRefRowActions` at setup time, exposed as methods on
   * the data source itself so `data-view`'s own (flavour-agnostic, cannot
   * import from this package) view-preset renderers can reach them via a
   * duck-typed structural cast — e.g. `list/pc/renderer.ts`'s row-level
   * note-action button. This package itself never imports
   * `@blocksuite/affine-block-note-ref` (or the note-property package)
   * directly — note-ref depends on root, which depends back on database;
   * a static import here would close that cycle. See `noteRefRowActions`'s
   * own field comment.
   */
  createNoteForRow(std: BlockStdScope, rowId: string): void {
    DatabaseBlockDataSource.noteRefRowActions?.createNoteForRow(
      std,
      this,
      rowId
    );
  }

  revealOrInsertNoteForRow(std: BlockStdScope, rowId: string): void {
    DatabaseBlockDataSource.noteRefRowActions?.revealOrInsertNoteForRow(
      std,
      this,
      rowId
    );
  }

  attachExistingNoteForRow(std: BlockStdScope, rowId: string): Promise<void> {
    return (
      DatabaseBlockDataSource.noteRefRowActions?.attachExistingNoteForRow(
        std,
        this,
        rowId
      ) ?? Promise.resolve()
    );
  }

  /**
   * Resolves the row's stored `Color` token to an actual CSS value using
   * the *current* theme — `getNoteColor` deliberately returns the raw,
   * unresolved token (see its own doc comment), so any renderer wanting an
   * actual paintable color calls this instead. Lives here (not in
   * `data-view`) because resolving needs `resolveColor`/`ThemeProvider`
   * from `@blocksuite/affine-model`/`@blocksuite/affine-shared`, which
   * `data-view` deliberately doesn't depend on — same duck-typed-delegate
   * reasoning as `createNoteForRow` and friends above.
   */
  getResolvedNoteColor(std: BlockStdScope, rowId: string): string | undefined {
    const color = this.getNoteColor(rowId);
    if (!color) return undefined;
    return resolveColor(color, std.get(ThemeProvider).appTheme);
  }

  /**
   * Resolves the effective "Highlight after due date" behavior for this
   * table — the per-table override (`DatabaseBlockModel.props.
   * highlightAfterDueDateOverride`) if set, otherwise the *live* global
   * editor setting. Unlike `taskStatusInheritance` (seeded once at
   * creation, never re-reads the global default afterward), this always
   * tracks the current global value when no override is set — per Story
   * 2.7's AC7, a table without its own override should follow the global
   * default as it changes, not a frozen snapshot from whenever the table
   * was created. See `list-block.ts`'s own identical `?? {}` fallback:
   * `EditorSettingProvider` isn't registered on a nested (e.g. cross-doc
   * reference) preview scope.
   */
  getHighlightAfterDueDateSetting(
    std: BlockStdScope
  ): 'highlight' | 'hide' | 'off' {
    const override = this._model.props.highlightAfterDueDateOverride;
    if (override) {
      return override;
    }
    // `.value`, not `.peek()` — see `getShowDueDateColumnSetting`'s own
    // comment; same reactivity fix, same live-testing regression.
    const taskWorkflowDefaults = TaskWorkflowDefaultsSchema.parse(
      std.getOptional(EditorSettingProvider)?.setting$.value
        ?.taskWorkflowDefaults ?? {}
    );
    return taskWorkflowDefaults.database.highlightAfterDueDate;
  }

  /**
   * Sets (or clears, via `undefined`) this table's own local override of
   * "Highlight after due date" — global-only settings (e.g. "Hide from
   * calendar when done", per Story 2.7's own explicit scope) have no
   * equivalent setter; only this one setting gets a per-table override.
   */
  setHighlightAfterDueDateOverride(
    value: 'highlight' | 'hide' | 'off' | undefined
  ) {
    // `store.updateBlock`'s own `syncBlockProps` explicitly skips any key
    // whose value is `undefined` (a deliberate "no patch" convention, not
    // a way to clear a prop) — clearing the override back to "follow the
    // live global default" needs an actual `delete`, which the reactive
    // `model.props` proxy supports directly (see `sync-controller.ts`'s
    // own `deleteProperty` trap).
    this._model.store.transact(() => {
      if (value === undefined) {
        delete this._model.props.highlightAfterDueDateOverride;
      } else {
        this._model.props.highlightAfterDueDateOverride = value;
      }
    });
  }

  /**
   * Resolves whether this row should currently be highlighted/hidden for
   * being overdue-and-undone (Story 2.7, AC5) — `null` means neither
   * applies (no Due date set, not yet overdue, already Done, or the
   * effective setting is `'off'`). "Overdue" compares Due date against the
   * *journal page's own date* when `std`'s currently-active doc is a
   * journal (per direct user decision — consistent with Done date's own
   * journal-date-not-wall-clock filter semantics elsewhere in this epic),
   * falling back to wall-clock "now" outside a journal context.
   */
  getDueDateHighlightState(
    std: BlockStdScope,
    rowId: string
  ): 'highlight' | 'hide' | null {
    const dueDateColumnId = this.getDueDateColumn()?.id;
    if (!dueDateColumnId) return null;
    const dueDateValue = getCell(this._model, rowId, dueDateColumnId)?.value;
    if (typeof dueDateValue !== 'number' || !Number.isFinite(dueDateValue)) {
      return null;
    }

    if (this.getTaskStatusInfo(rowId)?.checked) return null;

    const setting = this.getHighlightAfterDueDateSetting(std);
    if (setting === 'off') return null;

    const journalDate = std
      .getOptional(JournalTodoDatabaseProvider)
      ?.getJournalDate(std.store.id);
    // `parse(..., 'yyyy-MM-dd', ...)`, not `new Date(journalDate)` — the
    // latter parses an ISO-shaped date-only string as **UTC** midnight,
    // contradicting `formatLocalDate`'s own local-time convention used
    // everywhere else in this file and shifting the overdue comparison by
    // the local UTC offset near day boundaries. `isValid` guards against a
    // malformed `journalDate` string producing `NaN` (which would
    // otherwise make every row read as permanently overdue).
    const parsedJournalDate = journalDate
      ? parse(journalDate, 'yyyy-MM-dd', new Date())
      : undefined;
    const nowMs =
      parsedJournalDate && isValid(parsedJournalDate)
        ? parsedJournalDate.getTime()
        : Date.now();
    if (dueDateValue >= nowMs) return null;

    return setting;
  }

  /**
   * Story 2.7 (Task 4): resolves the `YYYY-MM-DD` journal date a calendar
   * click on this row should navigate to — the row's Done date if it's
   * marked done, otherwise today's local date (an undone row is always
   * carried over to "today"). Pure date resolution only; the caller
   * (`database-block.ts`'s `detailPanelConfig.openDetailPanel`) is
   * responsible for turning this into an actual docId via
   * `JournalTodoDatabaseProvider.getJournalDocId` and deciding what to do
   * if no journal page for that date exists yet.
   */
  resolveJournalTodoNavigationDate(rowId: string): string {
    if (this.getTaskStatusInfo(rowId)?.checked) {
      const doneDateColumnId = this.getDoneDateColumn()?.id;
      const doneDateValue = doneDateColumnId
        ? getCell(this._model, rowId, doneDateColumnId)?.value
        : undefined;
      if (typeof doneDateValue === 'number') {
        return formatLocalDate(doneDateValue);
      }
    }
    return formatLocalDate(Date.now());
  }

  private normalizeStatusLabel(value: string) {
    return value.trim().toLowerCase();
  }

  private getTaskStatusOptions(column: ColumnDataType): StatusOption[] {
    return ((column.data as { options?: StatusOption[] })?.options ??
      []) as StatusOption[];
  }

  private resolveWorkflowSemanticFromOption(
    option?: StatusOption
  ): WorkflowSemantic {
    const stage = this.resolveWorkflowStageFromOption(option);
    if (stage === 'done' || stage === 'todo' || stage === 'in_progress') {
      return stage;
    }
    if (stage === 'review') {
      return 'in_progress';
    }
    return 'none';
  }

  private resolveWorkflowStage(label: string): WorkflowStage | null {
    const normalized = this.normalizeStatusLabel(label);
    return STAGE_BY_ALIAS.get(normalized) ?? null;
  }

  private resolveWorkflowStageFromOption(option?: {
    id: string;
    value: string;
    semantic?: WorkflowSemantic;
  }): WorkflowStage | null {
    if (!option) {
      return null;
    }
    const semanticStage = semanticToStage(option.semantic);
    if (semanticStage) {
      return semanticStage;
    }
    const idStage = resolveWorkflowStageFromOptionId(option.id);
    return idStage ?? this.resolveWorkflowStage(option.value);
  }

  private isTaskStatusColumn(column: ColumnDataType) {
    if (column.type !== 'select') {
      return false;
    }
    const options = ((
      column.data as {
        options?: Array<{ id: string; value: string }>;
      }
    ).options ?? []) as Array<{ id: string; value: string }>;
    return options.some(option => this.resolveWorkflowStageFromOption(option));
  }

  private getRowStatusState(rowId: string): {
    provenance: StatusProvenance;
    manualLock: ManualLock;
  } {
    const state = this._model.props.taskStatusState?.[rowId];
    if (!state) {
      return { provenance: 'manual', manualLock: 'none' };
    }
    return {
      provenance: state.provenance,
      manualLock: state.manualLock,
    };
  }

  private setRowStatusState(
    rowId: string,
    next: Partial<{ provenance: StatusProvenance; manualLock: ManualLock }>
  ) {
    const current = this.getRowStatusState(rowId);
    const merged = {
      provenance: next.provenance ?? current.provenance,
      manualLock: next.manualLock ?? current.manualLock,
    };
    updateTaskStatusState(this._model, rowId, merged);
  }

  private resolveSelectStatusValue(value: unknown): string | undefined {
    if (typeof value === 'string') {
      return value;
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const option = value as { id?: unknown };
      return typeof option.id === 'string' ? option.id : undefined;
    }
    if (Array.isArray(value)) {
      const first = value[0] as { id?: string } | undefined;
      return typeof first?.id === 'string' ? first.id : undefined;
    }
    return undefined;
  }

  private getTaskStatusColumns() {
    return this._model.props.columns.filter(column =>
      this.isTaskStatusColumn(column)
    );
  }

  private recomputeAllParentStatusesFromChildren(): Record<string, boolean> {
    const doneFlags: Record<string, boolean> = {};
    for (const column of this.getTaskStatusColumns()) {
      for (const row of this._model.children) {
        Object.assign(
          doneFlags,
          // `descendantDemotedFromDone: true` — this is a full-tree
          // recompute (every row treated as "changed"), so the
          // demote-a-stale-'done'-ancestor branch inside
          // `recomputeParentStatusesFromChildren` must always be eligible
          // to run here, not just when a single specific row's demotion
          // triggered this call. Without this, that branch is gated on
          // `context?.descendantDemotedFromDone`, which defaulted to
          // `undefined` (falsy) at this call site — silently turning every
          // full recompute (both the "a descendant demoted from done"
          // cascade in `cellValueChange` and the `setTaskStatusInheritance`
          // settings-change path) into promote-only. The `autoDemoteAutoDone`
          // setting and manual-lock protection below still gate the actual
          // demotion, so this doesn't force anything unwanted through.
          this.recomputeParentStatusesFromChildren(row.id, column.id, 'auto', {
            descendantDemotedFromDone: true,
          })
        );
      }
    }
    return doneFlags;
  }

  private getChildrenByParentRowId() {
    const parentColumn = this._model.props.columns.find(
      column => column.name === TASK_PARENT_IDENTIFIER_COLUMN_NAME
    );
    if (!parentColumn) {
      return null;
    }

    const rowIds = this._model.children.map(child => child.id);
    const identityByRowId = new Map(
      rowIds.map(id => [
        id,
        createTaskIdentity({ docId: this.doc.id, blockId: id }),
      ])
    );
    const rowIdByIdentity = new Map(
      [...identityByRowId.entries()].map(([id, identity]) => [identity, id])
    );
    const childrenByParent = new Map<string, string[]>();
    for (const id of rowIds) {
      const parentCell = getCell(this._model, id, parentColumn.id)?.value;
      const parentIdentity =
        typeof parentCell === 'string'
          ? parentCell
          : parentCell instanceof Text
            ? parentCell.toString()
            : undefined;
      if (!parentIdentity) {
        continue;
      }
      const parsed = parseTaskIdentity(parentIdentity);
      if (!parsed || parsed.docId !== this.doc.id) {
        continue;
      }
      const parentRowId = rowIdByIdentity.get(parentIdentity);
      if (!parentRowId) {
        continue;
      }
      const list = childrenByParent.get(parentRowId) ?? [];
      list.push(id);
      childrenByParent.set(parentRowId, list);
    }

    return childrenByParent;
  }

  /**
   * Returns `{rowId: isDone}` for every row this cascade actually updated,
   * rather than stamping the Done date column itself — see
   * `stampDoneDateForRow`'s own comment for why: doing so here, mid-cascade,
   * can insert a brand-new Done date column (first time only) via
   * `addProperty`'s array splice, which corrupts the very hierarchy walk
   * (`getChildrenByParentRowId`/`this._model.children`) this function and
   * `recomputeParentStatusesFromChildren` both depend on. Callers collect
   * these results and stamp only after their own outermost `store.transact`
   * has fully committed.
   */
  private cascadeStatusToDescendants(
    rowId: string,
    propertyId: string,
    targetOption: StatusOption,
    provenance: StatusProvenance,
    manualLock: ManualLock
  ): Record<string, boolean> {
    const childrenByParent = this.getChildrenByParentRowId();
    if (!childrenByParent) {
      return {};
    }

    const descendants: string[] = [];
    const queue = [...(childrenByParent.get(rowId) ?? [])];
    const visitedDescendants = new Set<string>();
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || visitedDescendants.has(current)) {
        continue;
      }
      visitedDescendants.add(current);
      descendants.push(current);
      queue.push(...(childrenByParent.get(current) ?? []));
    }

    const statusColumn = this._model.props.columns.find(
      column => column.id === propertyId && column.type === 'select'
    );
    const options = ((
      statusColumn?.data as { options?: StatusOption[] } | undefined
    )?.options ?? []) as StatusOption[];
    const optionById = new Map(options.map(option => [option.id, option]));
    const targetStage = this.resolveWorkflowStageFromOption(targetOption);

    const cascadeUpdates: Record<string, unknown> = {};
    for (const descendantId of descendants) {
      const currentRaw = getCell(this._model, descendantId, propertyId)?.value;
      const currentId = this.resolveSelectStatusValue(currentRaw);
      if (currentId === targetOption.id) {
        continue;
      }
      const currentStage = currentId
        ? this.resolveWorkflowStageFromOption(optionById.get(currentId))
        : 'no_status';
      const currentState = this.getRowStatusState(descendantId);
      if (
        targetStage === 'todo' &&
        currentStage === 'done' &&
        currentState.provenance === 'manual' &&
        currentState.manualLock === 'done_locked'
      ) {
        continue;
      }
      cascadeUpdates[descendantId] = targetOption.id;
      this.setRowStatusState(descendantId, {
        provenance,
        manualLock,
      });
    }
    if (Object.keys(cascadeUpdates).length === 0) {
      return {};
    }
    updateCells(this._model, propertyId, cascadeUpdates);
    const cascadedIsDone = targetStage === 'done';
    const doneStamps: Record<string, boolean> = {};
    for (const descendantId of Object.keys(cascadeUpdates)) {
      doneStamps[descendantId] = cascadedIsDone;
    }
    return doneStamps;
  }

  /**
   * Returns `{rowId: isDone}` for every ancestor this recompute actually
   * updated — see `cascadeStatusToDescendants`'s own comment for why this
   * doesn't stamp the Done date column itself.
   */
  private recomputeParentStatusesFromChildren(
    changedRowId: string,
    propertyId: string,
    source: StatusProvenance = 'manual',
    context?: {
      descendantDemotedFromDone?: boolean;
    }
  ): Record<string, boolean> {
    const statusColumn = this._model.props.columns.find(
      column => column.id === propertyId && column.type === 'select'
    );
    if (!statusColumn) {
      return {};
    }
    if (!this.isTaskStatusColumn(statusColumn)) {
      return {};
    }
    const options = ((
      statusColumn.data as { options?: Array<{ id: string; value: string }> }
    ).options ?? []) as Array<{ id: string; value: string }>;
    const optionById = new Map(options.map(option => [option.id, option]));

    const stageToOption = new Map<
      WorkflowStage,
      { id: string; value: string }
    >();
    for (const option of options) {
      const stage = this.resolveWorkflowStageFromOption(option);
      if (stage && !stageToOption.has(stage)) {
        stageToOption.set(stage, option);
      }
    }
    if (stageToOption.size === 0) {
      return {};
    }

    const parentColumn = this._model.props.columns.find(
      column => column.name === TASK_PARENT_IDENTIFIER_COLUMN_NAME
    );
    if (!parentColumn) {
      return {};
    }

    const rowIds = this._model.children.map(child => child.id);
    const taskIdentityByRowId = new Map(
      rowIds.map(rowId => [
        rowId,
        createTaskIdentity({
          docId: this.doc.id,
          blockId: rowId,
        }),
      ])
    );
    const rowIdByIdentity = new Map(
      [...taskIdentityByRowId.entries()].map(([rowId, identity]) => [
        identity,
        rowId,
      ])
    );

    const childrenByParent = new Map<string, string[]>();
    for (const rowId of rowIds) {
      const parentCell = getCell(this._model, rowId, parentColumn.id)?.value;
      const parentIdentity =
        typeof parentCell === 'string'
          ? parentCell
          : parentCell instanceof Text
            ? parentCell.toString()
            : undefined;
      if (!parentIdentity) {
        continue;
      }
      const parsed = parseTaskIdentity(parentIdentity);
      if (!parsed || parsed.docId !== this.doc.id) {
        continue;
      }
      const parentRowId = rowIdByIdentity.get(parentIdentity);
      if (!parentRowId) {
        continue;
      }
      const list = childrenByParent.get(parentRowId) ?? [];
      list.push(rowId);
      childrenByParent.set(parentRowId, list);
    }

    const inheritance = this.getTaskStatusInheritance();
    if (
      inheritance.done === 'disabled' &&
      inheritance.inProgress === 'disabled'
    ) {
      return {};
    }
    const updates: Record<string, unknown> = {};
    // Tracked alongside `updates` since a different ancestor further up
    // the same chain can resolve to a different target stage than the
    // one just below it — each row's own Done date must reflect its own
    // resolved stage, not whatever the changed row's own stage was.
    const doneFlags: Record<string, boolean> = {};

    const getRowStage = (rowId: string): WorkflowStage => {
      const pending = updates[rowId];
      const raw = pending ?? getCell(this._model, rowId, propertyId)?.value;
      const selectedId = this.resolveSelectStatusValue(raw);
      if (!selectedId) {
        return 'no_status';
      }
      const option = optionById.get(selectedId);
      if (!option) {
        return 'no_status';
      }
      return this.resolveWorkflowStageFromOption(option) ?? 'no_status';
    };

    const getDescendantStages = (rowId: string): WorkflowStage[] => {
      const stages: WorkflowStage[] = [];
      const queue = [...(childrenByParent.get(rowId) ?? [])];
      const visitedDescendants = new Set<string>();
      while (queue.length > 0) {
        const current = queue.shift();
        if (!current || visitedDescendants.has(current)) {
          continue;
        }
        visitedDescendants.add(current);
        stages.push(getRowStage(current));
        queue.push(...(childrenByParent.get(current) ?? []));
      }
      return stages;
    };

    let currentParentRowId = rowIdByIdentity.get(
      (() => {
        const parentCell = getCell(
          this._model,
          changedRowId,
          parentColumn.id
        )?.value;
        return typeof parentCell === 'string'
          ? parentCell
          : parentCell instanceof Text
            ? parentCell.toString()
            : '';
      })()
    );

    const visitedParentRowIds = new Set<string>();
    while (currentParentRowId && !visitedParentRowIds.has(currentParentRowId)) {
      visitedParentRowIds.add(currentParentRowId);
      const children = childrenByParent.get(currentParentRowId) ?? [];
      if (children.length === 0) {
        break;
      }
      const descendantStages = getDescendantStages(currentParentRowId);

      let targetStage: WorkflowStage | null = null;
      const allDone =
        descendantStages.length > 0 &&
        descendantStages.every(stage => stage === 'done');
      const anyInProgressOrDone = descendantStages.some(
        stage =>
          STAGE_RANK[stage] >=
          STAGE_RANK[TASK_STATUS_ENGINE_CONFIG.thresholds.inProgressFloor]
      );
      const anyTodo = descendantStages.some(stage => stage === 'todo');

      if (inheritance.done === 'require-all-subtasks-complete' && allDone) {
        targetStage = 'done';
      } else if (
        inheritance.inProgress === 'start-when-any-subtask-starts' &&
        anyInProgressOrDone
      ) {
        targetStage = 'in_progress';
      } else if (anyTodo) {
        targetStage = 'todo';
      } else {
        targetStage = 'no_status';
      }

      const option = targetStage ? stageToOption.get(targetStage) : undefined;
      if (option) {
        const currentStage = getRowStage(currentParentRowId);
        const currentRaw =
          updates[currentParentRowId] ??
          getCell(this._model, currentParentRowId, propertyId)?.value;
        const currentId = this.resolveSelectStatusValue(currentRaw);
        const parentState = this.getRowStatusState(currentParentRowId);
        const wouldDemote =
          currentStage && targetStage
            ? STAGE_RANK[targetStage] < STAGE_RANK[currentStage]
            : false;
        const blockAutoDemotionFromDone =
          currentStage === 'done' &&
          wouldDemote &&
          parentState.manualLock === 'done_locked' &&
          parentState.provenance === 'manual' &&
          source === 'auto';

        if (
          context?.descendantDemotedFromDone &&
          source === 'auto' &&
          inheritance.autoDemoteAutoDone &&
          currentStage === 'done' &&
          !blockAutoDemotionFromDone
        ) {
          const demotionOption = option ?? stageToOption.get('in_progress');
          if (demotionOption && currentId !== demotionOption.id) {
            updates[currentParentRowId] = demotionOption.id;
            doneFlags[currentParentRowId] =
              this.resolveWorkflowStageFromOption(demotionOption) === 'done';
            this.setRowStatusState(currentParentRowId, {
              provenance: 'auto',
              manualLock: 'none',
            });
          }
        } else if (!blockAutoDemotionFromDone && currentId !== option.id) {
          updates[currentParentRowId] = option.id;
          doneFlags[currentParentRowId] = targetStage === 'done';
          this.setRowStatusState(currentParentRowId, {
            provenance: 'auto',
            manualLock: 'none',
          });
        } else if (
          source === 'auto' &&
          targetStage === 'done' &&
          currentId === option.id &&
          allDone
        ) {
          this.setRowStatusState(currentParentRowId, {
            provenance: 'auto',
            manualLock: 'none',
          });
        }
      }

      const currentParentCell = getCell(
        this._model,
        currentParentRowId,
        parentColumn.id
      )?.value;
      const currentParentIdentity =
        typeof currentParentCell === 'string'
          ? currentParentCell
          : currentParentCell instanceof Text
            ? currentParentCell.toString()
            : undefined;
      currentParentRowId = currentParentIdentity
        ? rowIdByIdentity.get(currentParentIdentity)
        : undefined;
    }

    if (Object.keys(updates).length === 0) {
      return {};
    }
    updateCells(this._model, propertyId, updates);
    return doneFlags;
  }

  private isReadonlySystemColumn(propertyId: string) {
    const result = this.getPropertyAndIndex(propertyId);
    if (!result) {
      return false;
    }
    return READONLY_SYSTEM_COLUMN_NAMES.has(result.column.name);
  }

  findRowByTaskIdentity(taskIdentity: string): TaskIdentityRowLookup {
    let match: string | null = null;
    for (const rowId of this.rows$.value) {
      const link = this.getTaskInteropLink(rowId);
      if (link?.taskIdentity === taskIdentity) {
        if (match && match !== rowId) {
          console.warn(
            '[task-interop] Duplicate task identity found in database rows',
            {
              taskIdentity,
              rowA: match,
              rowB: rowId,
            }
          );
          return { status: 'duplicate', rowIds: [match, rowId] };
        }
        match = rowId;
      }
    }

    if (!match) {
      return { status: 'missing' };
    }
    return { status: 'unique', rowId: match };
  }

  findRowIdByTaskIdentity(taskIdentity: string) {
    const result = this.findRowByTaskIdentity(taskIdentity);
    return result.status === 'unique' ? result.rowId : null;
  }

  getTaskInteropLink(rowId: string) {
    const stored = this.cellValueGet(rowId, TASK_INTEROP_COLUMN_ID);
    if (stored && typeof stored === 'object') {
      return stored as ReturnType<typeof createDatabaseRowTaskInteropLink>;
    }

    const model = this.getModelById(rowId);
    if (!model) {
      return null;
    }

    return createDatabaseRowTaskInteropLink({
      docId: this.doc.id,
      blockId: model.id,
      databaseId: this._model.id,
      sourceFlavor: model.flavour,
    });
  }

  setTaskInteropLink(
    rowId: string,
    link: ReturnType<typeof createDatabaseRowTaskInteropLink>
  ) {
    this._runCapture();
    updateCell(this._model, rowId, {
      columnId: TASK_INTEROP_COLUMN_ID,
      value: link,
    });
  }

  override get parentProvider() {
    return this._model.store.provider;
  }

  spacialProperties: Record<string, SpacialProperty> = {
    'created-time': {
      valueSet: () => {},
      valueGet: (rowId: string) => {
        const model = this.getModelById(rowId) as ParagraphBlockModel;
        if (!model) {
          return null;
        }
        return model.props['meta:createdAt'];
      },
    },
    'created-by': {
      valueSet: () => {},
      valueGet: (rowId: string) => {
        const model = this.getModelById(rowId) as
          | ParagraphBlockModel
          | undefined;
        return model ? model.props['meta:createdBy'] : null;
      },
    },
    type: {
      valueSet: () => {},
      valueGet: (rowId: string) => {
        const model = this.getModelById(rowId);
        if (!model) {
          return;
        }
        return getIcon(model);
      },
    },
    title: {
      valueSet: () => {},
      valueGet: (rowId: string) => {
        const model = this.getModelById(rowId);
        if (!model) {
          return;
        }
        return model.text;
      },
    },
    [TASK_INTEROP_COLUMN_ID]: {
      valueSet: (rowId: string, propertyId: string, value: unknown) => {
        updateCell(this._model, rowId, {
          columnId: propertyId,
          value,
        });
      },
      valueGet: (rowId: string, propertyId: string) => {
        return getCell(this._model, rowId, propertyId)?.value;
      },
    },
  };

  isSpacialProperty(propertyType: string): boolean {
    return this.spacialProperties[propertyType] !== undefined;
  }

  spacialValueGet(
    rowId: string,
    propertyId: string,
    propertyType: string
  ): unknown {
    return this.spacialProperties[propertyType]?.valueGet(rowId, propertyId);
  }

  /**
   * Registration seam for the note-row actions (create/reveal-or-insert/
   * attach-existing), filled in at setup time by
   * `@blocksuite/affine-block-database-note-property`'s
   * `DatabaseNotePropertyViewExtension`. `undefined` until that
   * extension's `setup()` runs. See `createNoteForRow`/friends above for
   * why this indirection exists instead of a static import.
   */
  static noteRefRowActions:
    | {
        createNoteForRow: (
          std: BlockStdScope,
          dataSource: DatabaseBlockDataSource,
          rowId: string
        ) => void;
        revealOrInsertNoteForRow: (
          std: BlockStdScope,
          dataSource: DatabaseBlockDataSource,
          rowId: string
        ) => void;
        attachExistingNoteForRow: (
          std: BlockStdScope,
          dataSource: DatabaseBlockDataSource,
          rowId: string
        ) => Promise<void>;
      }
    | undefined = undefined;

  static externalProperties = signal<PropertyMetaConfig[]>([]);
  static propertiesList = computed(() => {
    return [
      ...Object.values(databaseBlockProperties),
      ...this.externalProperties.value,
    ];
  });
  static propertiesMap = computed(() => {
    return Object.fromEntries(
      this.propertiesList.value.map(v => [v.type, v as PropertyMetaConfig])
    );
  });

  private _batch = 0;

  private readonly _model: DatabaseBlockModel;

  override featureFlags$: ReadonlySignal<DatabaseFlags> = computed(() => {
    const featureFlagService = this.doc.get(FeatureFlagService);
    const enableTableVirtualScroll = featureFlagService.getFlag(
      'enable_table_virtual_scroll'
    );
    return {
      enable_table_virtual_scroll: enableTableVirtualScroll ?? false,
    };
  });

  properties$: ReadonlySignal<string[]> = computed(() => {
    const fixedPropertiesSet = new Set(this.fixedProperties$.value);
    const properties: string[] = [];
    this._model.props.columns$.value.forEach(column => {
      if (fixedPropertiesSet.has(column.type)) {
        fixedPropertiesSet.delete(column.type);
      }
      properties.push(column.id);
    });

    const result = [...fixedPropertiesSet, ...properties];
    return result;
  });

  readonly$: ReadonlySignal<boolean> = computed(() => {
    return (
      this._model.store.readonly ||
      (IS_MOBILE &&
        !this._model.store.provider
          .get(FeatureFlagService)
          .getFlag('enable_mobile_database_editing'))
    );
  });

  rows$: ReadonlySignal<string[]> = computed(() => {
    return this._model.children.map(v => v.id);
  });

  viewConverts = databaseBlockViewConverts;

  viewDataList$: ReadonlySignal<DataViewDataType[]> = computed(() => {
    const override = this.serviceGet(DatabaseViewLocalOverrideProvider);
    if (override) return override.viewDataList$.value;
    return this._model.props.views$.value as DataViewDataType[];
  });

  override viewManager: ViewManager = new ViewManagerBase(this);

  viewMetas = databaseBlockViews;

  get doc() {
    return this._model.store;
  }

  allPropertyMetas$ = computed<PropertyMetaConfig<any, any, any, any>[]>(() => {
    return DatabaseBlockDataSource.propertiesList.value;
  });

  propertyMetas$ = computed<PropertyMetaConfig[]>(() => {
    return this.allPropertyMetas$.value.filter(
      v => !v.config.fixed && !v.config.hide
    );
  });

  constructor(
    model: DatabaseBlockModel,
    init?: (dataSource: DatabaseBlockDataSource) => void
  ) {
    super();
    this._model = model; // ensure invariants first
    init?.(this); // then allow external initialisation
  }

  private _runCapture() {
    if (this._batch) {
      return;
    }

    this._batch = requestAnimationFrame(() => {
      this.doc.captureSync();
      this._batch = 0;
    });
  }

  private getModelById(rowId: string): BlockModel | undefined {
    return this._model.children[this._model.childMap.value.get(rowId) ?? -1];
  }

  private newPropertyName(prefix = 'Column'): string {
    let i = 1;
    const hasSameName = (name: string) => {
      return this._model.props.columns$.value.some(
        column => column.name === name
      );
    };
    while (true) {
      let name = i === 1 ? prefix : `${prefix} ${i}`;
      if (!hasSameName(name)) {
        return name;
      }
      i++;
    }
  }

  cellValueChange(rowId: string, propertyId: string, value: unknown): void {
    if (this.isReadonlySystemColumn(propertyId)) {
      return;
    }
    this._runCapture();

    const type = this.propertyTypeGet(propertyId);
    if (type == null) {
      return;
    }
    const update = this.propertyMetaGet(type)?.config.rawValue.setValue;
    const old = this.cellValueGet(rowId, propertyId);
    const updateFn =
      update ??
      (({ setValue, newValue }) => {
        setValue(newValue);
      });
    updateFn({
      value: old,
      data: this.propertyDataGet(propertyId),
      dataSource: this,
      newValue: value,
      setValue: newValue => {
        // `columns`, not `columns$` — `columns$` is not a real reactive
        // signal this schema defines (confirmed: not referenced anywhere
        // else in this codebase); accessing it returns something that
        // is neither an empty array nor the actual column list, so
        // `.some(...)` here always evaluated false, silently dropping
        // every cell write that went through this fallback `setValue`
        // path (the default for any property type without its own custom
        // `rawValue.setValue`, e.g. the 'select' status column task
        // completion depends on) — which in turn meant status changes
        // were never persisted, and every downstream parent/ancestor
        // status-propagation and demotion computation kept operating on
        // stale 'no_status' reads. Every other column-existence check in
        // this file already uses the plain `columns` array.
        if (this._model.props.columns.some(v => v.id === propertyId)) {
          updateCell(this._model, rowId, {
            columnId: propertyId,
            value: newValue,
          });
        }
      },
    });

    // All Done-date stamping is collected into `doneStamps` and applied
    // only after the whole transact below fully commits — see the comment
    // on `stampDoneDateForRow`/`cascadeStatusToDescendants` for why:
    // stamping inline, mid-cascade, can insert a brand-new Done date
    // column (first time only) via `addProperty`'s array splice, which
    // corrupted the hierarchy walk `cascadeStatusToDescendants`/
    // `recomputeParentStatusesFromChildren` both depend on (confirmed by
    // regression: 12 pre-existing cascade tests failed until every stamp
    // was deferred to run strictly after all cascade mutations settle).
    const doneStamps: Record<string, boolean> = {};

    this._model.store.transact(() => {
      let descendantDemotedFromDone = false;

      const statusColumn = this._model.props.columns.find(
        column => column.id === propertyId && column.type === 'select'
      );
      if (statusColumn && this.isTaskStatusColumn(statusColumn)) {
        const options = ((statusColumn.data as { options?: StatusOption[] })
          .options ?? []) as StatusOption[];
        const optionById = new Map(options.map(option => [option.id, option]));
        const currentId = this.resolveSelectStatusValue(old);
        const currentStage = currentId
          ? this.resolveWorkflowStageFromOption(optionById.get(currentId))
          : 'no_status';
        const nextId = this.resolveSelectStatusValue(value);
        const nextOption = nextId ? optionById.get(nextId) : undefined;
        const nextStage = nextOption
          ? this.resolveWorkflowStageFromOption(nextOption)
          : 'no_status';
        const wasDone = currentStage === 'done';
        const isDone = nextStage === 'done';
        descendantDemotedFromDone = wasDone && !isDone;
        const manualLock: ManualLock =
          isDone || wasDone ? 'done_locked' : 'none';
        this.setRowStatusState(rowId, {
          provenance: 'manual',
          manualLock,
        });
        doneStamps[rowId] = isDone;

        if (nextStage === 'todo') {
          const todoOption = options.find(
            option => this.resolveWorkflowStageFromOption(option) === 'todo'
          );
          if (todoOption) {
            Object.assign(
              doneStamps,
              this.cascadeStatusToDescendants(
                rowId,
                propertyId,
                todoOption,
                'auto',
                'none'
              )
            );
          }
        } else if (
          nextStage === 'done' &&
          nextOption &&
          this.getTaskStatusInheritance().cascadeManualDoneToDescendants
        ) {
          Object.assign(
            doneStamps,
            this.cascadeStatusToDescendants(
              rowId,
              propertyId,
              nextOption,
              'auto',
              'done_locked'
            )
          );
        }
      }

      Object.assign(
        doneStamps,
        this.recomputeParentStatusesFromChildren(rowId, propertyId, 'auto', {
          descendantDemotedFromDone,
        })
      );
      if (descendantDemotedFromDone) {
        Object.assign(
          doneStamps,
          this.recomputeAllParentStatusesFromChildren()
        );
      }
    });

    for (const [stampRowId, isDone] of Object.entries(doneStamps)) {
      this.stampDoneDateForRow(stampRowId, isDone);
    }
  }

  cellValueGet(rowId: string, propertyId: string): unknown {
    if (this.isSpacialProperty(propertyId)) {
      return this.spacialValueGet(rowId, propertyId, propertyId);
    }
    const type = this.propertyTypeGet(propertyId);
    if (!type) {
      return;
    }
    if (this.isSpacialProperty(type)) {
      return this.spacialValueGet(rowId, propertyId, type);
    }
    const meta = this.propertyMetaGet(type);
    if (!meta) {
      return;
    }
    const rawValue =
      getCell(this._model, rowId, propertyId)?.value ??
      meta.config.rawValue.default();
    const schema = meta.config.rawValue.schema;
    const result = schema.safeParse(rawValue);
    if (result.success) {
      return result.data;
    }
    return;
  }

  propertyAdd(
    insertToPosition: InsertToPosition,
    ops?: {
      type?: string;
      name?: string;
    }
  ): string | undefined {
    this.doc.captureSync();
    const { type, name } = ops ?? {};
    const property = this.propertyMetaGet(
      type ?? propertyPresets.multiSelectPropertyConfig.type
    );
    if (!property) {
      return;
    }
    const result = addProperty(
      this._model,
      insertToPosition,
      property.create(this.newPropertyName(name))
    );
    return result;
  }

  protected override getNormalPropertyAndIndex(propertyId: string):
    | {
        column: ColumnDataType<Record<string, unknown>>;
        index: number;
      }
    | undefined {
    // Reads the raw `.columns` prop, not the `.columns$` signal — every
    // other column lookup in this file already does this (see
    // `ensureTaskHierarchyColumns`'s `getOrAdd`, `rowMove`, etc.), for a
    // real reason: a column can be created and immediately read back
    // *within the same nested `store.transact()` call* (e.g. Kanban's
    // `defaultData` auto-creating a fallback "Status" column via
    // `propertyAdd`, then reading it straight back via `propertyTypeGet`
    // to build its `groupBy`, all while still inside `viewChangeType`'s
    // own outer `updateView` transaction). `columns$` only refreshes once
    // the *outermost* transaction closes, so it can't see a column
    // written inside a still-open nested one — the raw prop reflects the
    // proxied array immediately, regardless of transaction nesting.
    const columns = this._model.props.columns;
    const index = columns.findIndex(v => v.id === propertyId);
    if (index >= 0) {
      const column = columns[index];
      if (!column) {
        return;
      }
      return {
        column,
        index,
      };
    }
    return;
  }

  private getPropertyAndIndex(propertyId: string):
    | {
        column: ColumnDataType<Record<string, unknown>>;
        index: number;
      }
    | undefined {
    const result = this.getNormalPropertyAndIndex(propertyId);
    if (result) {
      return result;
    }
    if (this.isFixedProperty(propertyId)) {
      const meta = this.propertyMetaGet(propertyId);
      if (!meta) {
        return;
      }
      const defaultData = meta.config.fixed?.defaultData ?? {};
      return {
        column: {
          data: defaultData,
          id: propertyId,
          type: propertyId,
          name: meta.config.name,
        },
        index: -1,
      };
    }
    return undefined;
  }

  private updateProperty(id: string, updater: ColumnUpdater) {
    const result = this.getPropertyAndIndex(id);
    if (!result) {
      return;
    }
    const { column: prevColumn, index } = result;
    this._model.store.transact(() => {
      if (index >= 0) {
        const result = updater(prevColumn);
        this._model.props.columns[index] = { ...prevColumn, ...result };
      } else {
        const result = updater(prevColumn);
        this._model.props.columns = [
          ...this._model.props.columns,
          { ...prevColumn, ...result },
        ];
      }
    });
    return id;
  }

  propertyDataGet(propertyId: string): Record<string, unknown> {
    const result = this.getPropertyAndIndex(propertyId);
    if (!result) {
      return {};
    }
    return result.column.data;
  }

  propertyDataSet(propertyId: string, data: Record<string, unknown>): void {
    this._runCapture();
    this.updateProperty(propertyId, () => ({ data }));
  }

  propertyDataTypeGet(propertyId: string): TypeInstance | undefined {
    const result = this.getPropertyAndIndex(propertyId);
    if (!result) {
      return;
    }
    const { column } = result;
    const meta = this.propertyMetaGet(column.type);
    if (!meta) {
      return;
    }
    return meta.config?.jsonValue.type({
      data: column.data,
      dataSource: this,
    });
  }

  propertyDelete(id: string): void {
    if (this.isFixedProperty(id)) {
      return;
    }
    if (this.isReadonlySystemColumn(id)) {
      return;
    }
    this.doc.captureSync();
    const index = this._model.props.columns.findIndex(v => v.id === id);
    if (index < 0) return;

    this.doc.transact(() => {
      this._model.props.columns = this._model.props.columns.filter(
        (_, i) => i !== index
      );
    });
  }

  propertyDuplicate(propertyId: string): string | undefined {
    if (this.isFixedProperty(propertyId)) {
      return;
    }
    this.doc.captureSync();
    const currentSchema = getProperty(this._model, propertyId);
    if (!currentSchema) {
      return;
    }
    const { id: copyId, ...nonIdProps } = currentSchema;
    const names = new Set(this._model.props.columns$.value.map(v => v.name));
    let index = 1;
    while (names.has(`${nonIdProps.name}(${index})`)) {
      index++;
    }
    const schema = { ...nonIdProps, name: `${nonIdProps.name}(${index})` };
    const id = addProperty(
      this._model,
      {
        before: false,
        id: propertyId,
      },
      schema
    );
    copyCellsByProperty(this._model, copyId, id);
    return id;
  }

  propertyMetaGet(type: string): PropertyMetaConfig | undefined {
    return DatabaseBlockDataSource.propertiesMap.value[type];
  }

  propertyNameGet(propertyId: string): string {
    if (propertyId === 'type') {
      return 'Block Type';
    }
    const result = this.getPropertyAndIndex(propertyId);
    if (!result) {
      return '';
    }
    return result.column.name;
  }

  propertyNameSet(propertyId: string, name: string): void {
    if (this.isReadonlySystemColumn(propertyId)) {
      return;
    }
    this.doc.captureSync();
    this.updateProperty(propertyId, () => ({ name }));
  }

  override propertyReadonlyGet(propertyId: string): boolean {
    if (propertyId === 'type') return true;
    if (this.isReadonlySystemColumn(propertyId)) return true;
    return false;
  }

  propertyTypeGet(propertyId: string): string | undefined {
    if (propertyId === 'type') {
      return 'image';
    }
    const result = this.getPropertyAndIndex(propertyId);
    if (!result) {
      return;
    }
    return result.column.type;
  }

  propertyTypeSet(propertyId: string, toType: string): void {
    if (this.isFixedProperty(propertyId)) {
      return;
    }
    if (this.isReadonlySystemColumn(propertyId)) {
      return;
    }
    const meta = this.propertyMetaGet(toType);
    if (!meta) {
      return;
    }
    const currentType = this.propertyTypeGet(propertyId);
    const currentData = this.propertyDataGet(propertyId);
    const rows = this.rows$.value;
    const currentCells = rows.map(rowId =>
      this.cellValueGet(rowId, propertyId)
    );
    const convertFunction = databasePropertyConverts.find(
      v => v.from === currentType && v.to === toType
    )?.convert;
    const result = convertFunction?.(
      currentData as any,

      currentCells as any
    ) ?? {
      property: meta.config.propertyData.default(),
      cells: currentCells.map(() => undefined),
    };
    this.doc.captureSync();
    updateProperty(this._model, propertyId, () => ({
      type: toType,
      data: result.property,
    }));
    const cells: Record<string, unknown> = {};
    currentCells.forEach((value, i) => {
      if (value != null || result.cells[i] != null) {
        const rowId = rows[i];
        if (rowId) {
          cells[rowId] = result.cells[i];
        }
      }
    });
    updateCells(this._model, propertyId, cells);
  }

  rowAdd(insertPosition: InsertToPosition | number): string {
    this.doc.captureSync();
    const index =
      typeof insertPosition === 'number'
        ? insertPosition
        : insertPositionToIndex(insertPosition, this._model.children);
    return this.doc.addBlock('affine:paragraph', {}, this._model.id, index);
  }

  rowAddAsTodoList(insertPosition: InsertToPosition | number): string {
    const { levelColumnId } = this.ensureTaskHierarchyColumns();
    // Ensures the Status column exists so it's ready the moment the user
    // interacts with this row, but deliberately leaves the new row's own
    // Status cell unset — a fresh todo starts in a genuine "no status yet"
    // state, not pre-assigned to the "todo" option (that's a real,
    // selectable value someone can set later, not a default/placeholder
    // one).
    this.ensureTaskStatusColumn();
    this.doc.captureSync();
    const index =
      typeof insertPosition === 'number'
        ? insertPosition
        : insertPositionToIndex(insertPosition, this._model.children);
    const rowId = this.doc.addBlock(
      'affine:list',
      { type: 'todo', checked: false },
      this._model.id,
      index
    );
    if (levelColumnId) {
      updateCell(this._model, rowId, { columnId: levelColumnId, value: 0 });
    }
    return rowId;
  }

  ensureRowAsTodoList(rowId: string): boolean {
    const model = this.getModelById(rowId);
    if (!model) {
      return false;
    }
    if (model.flavour === 'affine:list') {
      return (model as ListBlockModel).props.type === 'todo';
    }
    if (model.flavour !== 'affine:paragraph') {
      return false;
    }
    const row = model as ParagraphBlockModel;
    if (row.props.type !== 'text' || !row.isEmpty()) {
      return false;
    }
    const { levelColumnId } = this.ensureTaskHierarchyColumns();
    // See `rowAddAsTodoList` — ensures the Status column exists, but leaves
    // this row's own Status cell unset (a genuine "no status yet" state).
    this.ensureTaskStatusColumn();
    const index = this._model.children.findIndex(child => child.id === rowId);
    if (index < 0) {
      return false;
    }

    this.doc.captureSync();
    this.doc.deleteBlock(row);
    this.doc.addBlock(
      'affine:list',
      { id: rowId, type: 'todo', checked: false, text: row.text?.clone() },
      this._model.id,
      index
    );
    if (levelColumnId) {
      updateCell(this._model, rowId, { columnId: levelColumnId, value: 0 });
    }
    return true;
  }

  rowDelete(ids: string[]): void {
    this.doc.captureSync();
    for (const id of ids) {
      const block = this.doc.getBlock(id);
      if (block) {
        this.doc.deleteBlock(block.model);
      }
    }
    deleteRows(this._model, ids);
  }

  /**
   * Resolves the "subtree" that `rowId` drags along whenever it is moved or
   * re-leveled: `rowId` itself plus every immediately-following row whose
   * hierarchy level is greater than `rowId`'s own level (i.e. its current
   * children/descendants, in document order). Shared by `rowMove` (which
   * relocates the subtree to a new sibling position) and
   * `applyPendingHierarchyLevel` (which only re-levels the subtree in
   * place), so both stay consistent about what counts as "part of the
   * move".
   */
  private _resolveMovingSubtree(rowId: string): {
    movingModels: BlockModel[];
    movedRowIds: string[];
    oldRootLevel: number;
  } {
    const model = this.doc.getModelById(rowId);
    if (!model) {
      return { movingModels: [], movedRowIds: [], oldRootLevel: 0 };
    }
    const levelColumn = this._model.props.columns.find(
      column => column.name === TASK_HIERARCHY_LEVEL_COLUMN_NAME
    );
    const children = this._model.children;
    const startIndex = children.findIndex(child => child.id === rowId);
    let movingModels = [model];
    let movedRowIds = [rowId];
    let oldRootLevel = 0;
    if (startIndex >= 0 && levelColumn) {
      const rootLevel = this.parseHierarchyLevel(
        getCell(this._model, rowId, levelColumn.id)?.value
      );
      oldRootLevel = rootLevel;
      const subtree = [children[startIndex]].filter(
        (v): v is typeof model => !!v
      );
      for (let i = startIndex + 1; i < children.length; i++) {
        const child = children[i];
        if (!child) break;
        const level = this.parseHierarchyLevel(
          getCell(this._model, child.id, levelColumn.id)?.value
        );
        if (level <= rootLevel) {
          break;
        }
        subtree.push(child as typeof model);
      }
      movingModels = subtree;
      movedRowIds = subtree.map(item => item.id);
    }
    return { movingModels, movedRowIds, oldRootLevel };
  }

  rowMove(rowId: string, position: InsertToPosition): void {
    const model = this.doc.getModelById(rowId);
    if (model) {
      const { movingModels, movedRowIds, oldRootLevel } =
        this._resolveMovingSubtree(rowId);

      const index = insertPositionToIndex(position, this._model.children);
      const target = this._model.children[index];
      if (target && movedRowIds.includes(target.id)) {
        // LIST-05/D-02 (+ CR-03 hardening): the resolved target collides
        // with `rowId`'s own moving subtree — either `rowId` itself (e.g.
        // dragging a row onto its immediately-preceding sibling), or one of
        // `rowId`'s own descendants (e.g. dragging a row onto its own
        // indented child, which stays rendered directly beneath it during
        // the drag and is trivially droppable-onto). Either way no real
        // reorder is possible: `Store.moveBlocks` would silently no-op
        // (console.error) a move whose target sibling is inside the set of
        // blocks being moved, while `recomputeHierarchyMetadataAfterMove`
        // would still run unconditionally afterward, desyncing hierarchy
        // metadata from actual row order. Fall through to the same
        // level-only recompute `applyPendingHierarchyLevel` already uses
        // for the keyboard-toolbar indent/outdent buttons (see its own doc
        // comment for why `moveBlocks` can't be reused here) so any pending
        // level change still commits, without ever attempting the doomed
        // move.
        this.applyPendingHierarchyLevel(rowId);
        return;
      }
      this._pendingHierarchyMoveByRowId.set(rowId, {
        movedRowIds,
        oldRootLevel,
      });
      this.doc.moveBlocks(movingModels, this._model, target);
      this.recomputeHierarchyMetadataAfterMove(rowId);
    }
  }

  /**
   * Applies a previously-queued `setPendingHierarchyLevel(rowId, ...)` in
   * place, without reordering `rowId` relative to its siblings. Indent/
   * outdent only ever need to change `rowId`'s level (and shift any of its
   * existing descendants by the same delta) — never to move `rowId` to a
   * different sibling position — so this never needs `doc.moveBlocks`.
   *
   * `rowMove`'s "self-target" trick (`rowMove(rowId, { id: rowId, before:
   * false })`) was previously reused to trigger the same recompute
   * pipeline, but it breaks whenever `rowId` has at least one child: the
   * resolved target lands on that child, which is already part of the
   * subtree `rowMove` computes as "being moved", and `Store.moveBlocks`
   * silently rejects (`console.error` + no-op) a move whose target is
   * inside the set of blocks being moved. This method mirrors `rowMove`'s
   * descendant-subtree resolution and feeds the same
   * `recomputeHierarchyMetadataAfterMove` bookkeeping directly, without
   * ever attempting a block move.
   */
  applyPendingHierarchyLevel(rowId: string): void {
    const model = this.doc.getModelById(rowId);
    if (!model) return;

    const { movedRowIds, oldRootLevel } = this._resolveMovingSubtree(rowId);
    this._pendingHierarchyMoveByRowId.set(rowId, {
      movedRowIds,
      oldRootLevel,
    });
    this.recomputeHierarchyMetadataAfterMove(rowId);
  }

  private recomputeHierarchyMetadataAfterMove(movedRowId: string) {
    const levelColumn = this._model.props.columns.find(
      column => column.name === TASK_HIERARCHY_LEVEL_COLUMN_NAME
    );
    const parentColumn = this._model.props.columns.find(
      column => column.name === TASK_PARENT_IDENTIFIER_COLUMN_NAME
    );
    const ancestorColumn = this._model.props.columns.find(
      column => column.name === TASK_ANCESTOR_IDENTIFIERS_COLUMN_NAME
    );
    if (!levelColumn || !parentColumn || !ancestorColumn) {
      return;
    }

    const rowIds = this._model.children.map(child => child.id);
    const movedIndex = rowIds.indexOf(movedRowId);
    if (movedIndex < 0) {
      return;
    }

    const pendingMove = this._pendingHierarchyMoveByRowId.get(movedRowId);
    this._pendingHierarchyMoveByRowId.delete(movedRowId);

    const levels = rowIds.map(rowId =>
      this.parseHierarchyLevel(
        getCell(this._model, rowId, levelColumn.id)?.value
      )
    );
    const pendingLevel = this._pendingHierarchyLevelByRowId.get(movedRowId);
    this._pendingHierarchyLevelByRowId.delete(movedRowId);
    const nextRootLevel =
      pendingLevel != null && Number.isFinite(pendingLevel)
        ? pendingLevel
        : movedIndex > 0
          ? (levels[movedIndex - 1] ?? 0)
          : 0;
    levels[movedIndex] = nextRootLevel;

    if (pendingMove && pendingMove.movedRowIds.length > 0) {
      const movedSet = new Set(pendingMove.movedRowIds);
      const delta = nextRootLevel - pendingMove.oldRootLevel;
      if (delta !== 0) {
        for (let i = 0; i < rowIds.length; i++) {
          const id = rowIds[i];
          if (!id || !movedSet.has(id) || id === movedRowId) {
            continue;
          }
          const current = levels[i] ?? 0;
          levels[i] = Math.max(0, current + delta);
        }
      }
    }

    const levelCells: Record<string, unknown> = {};
    const parentCells: Record<string, unknown> = {};
    const ancestorCells: Record<string, unknown> = {};
    const stack: string[] = [];

    // Only write cells whose value actually changes (or that don't exist
    // yet). Rewriting every row's three cells with fresh `Text`s on each
    // move cost 6 s and 85 KB of Yjs history per drag on a 298-row
    // Journal Todo (999.18).
    const textOf = (rowId: string, columnId: string) => {
      const cell = getCell(this._model, rowId, columnId);
      if (!cell) return null;
      return cell.value == null ? '' : String(cell.value);
    };

    for (let i = 0; i < rowIds.length; i++) {
      const rowId = rowIds[i];
      if (!rowId) continue;
      const level = Math.max(0, levels[i] ?? 0);
      while (stack.length > level) {
        stack.pop();
      }

      const levelCell = getCell(this._model, rowId, levelColumn.id);
      if (!levelCell || this.parseHierarchyLevel(levelCell.value) !== level) {
        levelCells[rowId] = level;
      }
      const parentIdentity = stack.at(-1) ?? '';
      if (textOf(rowId, parentColumn.id) !== parentIdentity) {
        parentCells[rowId] = parentIdentity
          ? new Text(parentIdentity)
          : undefined;
      }
      const ancestors =
        stack.length > 0 ? encodeTaskAncestorIdentities(stack) : '';
      if (textOf(rowId, ancestorColumn.id) !== ancestors) {
        ancestorCells[rowId] = ancestors ? new Text(ancestors) : undefined;
      }

      const identity = createTaskIdentity({
        docId: this.doc.id,
        blockId: rowId,
      });
      stack[level] = identity;
      stack.length = level + 1;
    }

    this.doc.transact(() => {
      updateCells(this._model, levelColumn.id, levelCells);
      updateCells(this._model, parentColumn.id, parentCells);
      updateCells(this._model, ancestorColumn.id, ancestorCells);
    });
  }

  applyTaskHierarchyMutation(
    updatedLevels: Map<string, number>,
    updatedParents: Map<string, string | undefined>,
    updatedAncestors: Map<string, string>
  ) {
    const levelColumn = this._model.props.columns.find(
      column => column.name === TASK_HIERARCHY_LEVEL_COLUMN_NAME
    );
    const parentColumn = this._model.props.columns.find(
      column => column.name === TASK_PARENT_IDENTIFIER_COLUMN_NAME
    );
    const ancestorColumn = this._model.props.columns.find(
      column => column.name === TASK_ANCESTOR_IDENTIFIERS_COLUMN_NAME
    );
    if (!levelColumn || !parentColumn || !ancestorColumn) {
      return;
    }

    const levelCells: Record<string, unknown> = {};
    const parentCells: Record<string, unknown> = {};
    const ancestorCells: Record<string, unknown> = {};

    for (const rowId of this._model.children.map(child => child.id)) {
      const level = updatedLevels.get(rowId);
      if (level != null) {
        levelCells[rowId] = level;
      }

      if (updatedParents.has(rowId)) {
        const parent = updatedParents.get(rowId);
        parentCells[rowId] = parent ? new Text(parent) : undefined;
      }

      if (updatedAncestors.has(rowId)) {
        const ancestors = updatedAncestors.get(rowId) ?? '';
        ancestorCells[rowId] = ancestors ? new Text(ancestors) : undefined;
      }
    }

    updateCells(this._model, levelColumn.id, levelCells);
    updateCells(this._model, parentColumn.id, parentCells);
    updateCells(this._model, ancestorColumn.id, ancestorCells);
  }

  viewDataAdd(viewData: DataViewDataType): string {
    const override = this.serviceGet(DatabaseViewLocalOverrideProvider);
    if (override) {
      const id = override.viewDataAdd(viewData);
      this.hideDefaultHiddenColumnsForNewView(id);
      return id;
    }
    this._model.store.captureSync();
    this._model.store.transact(() => {
      this._model.props.views = [...this._model.props.views, viewData];
    });
    this.hideDefaultHiddenColumnsForNewView(viewData.id);
    return viewData.id;
  }

  viewDataAddWithoutCapture(viewData: DataViewDataType): string {
    const override = this.serviceGet(DatabaseViewLocalOverrideProvider);
    if (override) {
      const id = override.viewDataAdd(viewData);
      this.hideDefaultHiddenColumnsForNewView(id);
      return id;
    }
    this._model.store.transact(() => {
      this._model.props.views = [...this._model.props.views, viewData];
    });
    this.hideDefaultHiddenColumnsForNewView(viewData.id);
    return viewData.id;
  }

  viewDataDelete(viewId: string): void {
    const override = this.serviceGet(DatabaseViewLocalOverrideProvider);
    if (override) {
      override.viewDataDelete(viewId);
      return;
    }
    this._model.store.captureSync();
    deleteView(this._model, viewId);
  }

  viewDataDuplicate(id: string): string {
    const override = this.serviceGet(DatabaseViewLocalOverrideProvider);
    if (override) return override.viewDataDuplicate(id);
    return duplicateView(this._model, id);
  }

  viewDataGet(viewId: string): DataViewDataType | undefined {
    return this.viewDataList$.value.find(data => data.id === viewId)!;
  }

  viewDataMoveTo(id: string, position: InsertToPosition): void {
    const override = this.serviceGet(DatabaseViewLocalOverrideProvider);
    if (override) {
      override.viewDataMoveTo(id, position);
      return;
    }
    moveViewTo(this._model, id, position);
  }

  viewDataUpdate<ViewData extends DataViewDataType>(
    id: string,
    updater: (data: ViewData) => Partial<ViewData>
  ): void {
    const override = this.serviceGet(DatabaseViewLocalOverrideProvider);
    if (override) {
      override.viewDataUpdate(id, updater);
      return;
    }
    updateView(this._model, id, updater);
  }

  viewMetaGet(type: string): ViewMeta {
    const view = databaseBlockViewMap[type];
    if (!view) {
      throw new BlockSuiteError(
        ErrorCode.DatabaseBlockError,
        `Unknown view type: ${type}`
      );
    }
    return view;
  }

  viewMetaGetById(viewId: string): ViewMeta | undefined {
    const view = this.viewDataGet(viewId);
    if (!view) {
      return;
    }
    return this.viewMetaGet(view.mode);
  }
}

export const databaseViewInitTemplate = (
  datasource: DatabaseBlockDataSource,
  viewType: string,
  options?: {
    taskWorkflowDefaults?: ReturnType<typeof TaskWorkflowDefaultsSchema.parse>;
  }
) => {
  const taskWorkflowDefaults =
    options?.taskWorkflowDefaults ?? DEFAULT_TASK_WORKFLOW_DEFAULTS;
  datasource.setTaskStatusInheritance(
    taskWorkflowDefaults.database.taskStatusInheritance
  );
  if (viewType === 'kanban' || viewType === 'list') {
    const statusColumnId = datasource.propertyAdd('end', {
      type: 'select',
      name:
        taskWorkflowDefaults.list.statusMapping.statusColumnName || 'Status',
    });
    if (statusColumnId) {
      datasource.propertyDataSet(statusColumnId, {
        options: createTaskWorkflowStatusOptions(
          taskWorkflowDefaults,
          taskWorkflowDefaults.list.statusMapping.doneTagLabel
        ),
      });
    }
  }
  Array.from({ length: 3 }).forEach(() => {
    datasource.rowAdd('end');
  });
  datasource.viewManager.viewAdd(viewType);
};

const addDatabaseViewWithoutCapture = (
  datasource: DatabaseBlockDataSource,
  viewType: string
) => {
  const meta = datasource.viewMetaGet(viewType);
  const id = nanoid();
  const data = meta.model.defaultData(datasource.viewManager);
  datasource.viewDataAddWithoutCapture({
    ...data,
    id,
    name: meta.model.defaultName,
    mode: viewType,
  });
  datasource.viewManager.setCurrentView(id);
  return id;
};

export const convertToDatabase = (host: EditorHost, viewType: string) => {
  const [_, ctx] = host.std.command.exec(getSelectedModelsCommand, {
    types: ['block', 'text'],
  });
  const { selectedModels } = ctx;
  const firstModel = selectedModels?.[0];
  if (!firstModel) return;

  host.store.captureSync();

  let insertionTarget = firstModel;
  let parentModel = host.store.getParent(insertionTarget);
  while (parentModel?.flavour === 'affine:list') {
    insertionTarget = parentModel;
    parentModel = host.store.getParent(insertionTarget);
  }
  if (!parentModel) {
    return;
  }

  const id = host.store.addBlock(
    'affine:database',
    {},
    parentModel,
    parentModel.children.indexOf(insertionTarget)
  );
  const databaseModel = host.store.getBlock(id)?.model as
    | DatabaseBlockModel
    | undefined;
  if (!databaseModel) {
    return;
  }

  host.store.transact(() => {
    const getPathFromRoot = (model: BlockModel) => {
      const path: number[] = [];
      let current: BlockModel | null = model;
      while (current) {
        const parent = host.store.getParent(current);
        if (!parent) break;
        path.unshift(
          parent.children.findIndex(child => child.id === current?.id)
        );
        current = parent;
      }
      return path;
    };

    const comparePath = (a: number[], b: number[]) => {
      const len = Math.min(a.length, b.length);
      for (let i = 0; i < len; i++) {
        const left = a[i] ?? -1;
        const right = b[i] ?? -1;
        if (left !== right) return left - right;
      }
      return a.length - b.length;
    };

    const orderedSelectedModels = [...selectedModels].sort((a, b) =>
      comparePath(getPathFromRoot(a), getPathFromRoot(b))
    );

    const collectTodoRowsPreorder = (roots: BlockModel[]) => {
      const visited = new Set<string>();
      const result: ListBlockModel[] = [];

      const walk = (node: BlockModel) => {
        if (visited.has(node.id)) return;
        visited.add(node.id);

        if (
          node.flavour === 'affine:list' &&
          (node as ListBlockModel).props.type === 'todo'
        ) {
          result.push(node as ListBlockModel);
        }

        for (const child of node.children) {
          walk(child);
        }
      };

      for (const root of roots) {
        walk(root);
      }

      return result;
    };

    const datasource = new DatabaseBlockDataSource(databaseModel);

    // See `list-block.ts`'s own identical fallback: `EditorSettingProvider`
    // isn't registered on a nested (e.g. cross-doc reference) preview scope,
    // so this must not pass a bare `undefined` to `.parse()`.
    const taskWorkflowDefaults = TaskWorkflowDefaultsSchema.parse(
      host.std.getOptional(EditorSettingProvider)?.setting$.peek()
        .taskWorkflowDefaults ?? {}
    );
    const isTodoSelection = orderedSelectedModels.every(
      model =>
        model.flavour === 'affine:list' &&
        (model as ListBlockModel).props.type === 'todo'
    );
    if (!isTodoSelection) {
      const selectedIds = new Set(orderedSelectedModels.map(model => model.id));
      const listRows = orderedSelectedModels.filter(
        (model): model is ListBlockModel => model.flavour === 'affine:list'
      );
      const hierarchyLevelByRowId = new Map<string, number>();
      const parentTaskIdentityByRowId = new Map<string, string | undefined>();
      const ancestorTaskIdentitiesByRowId = new Map<string, string>();
      for (const row of listRows) {
        const ancestors: string[] = [];
        let parent = host.store.getParent(row) as ListBlockModel | null;
        while (parent?.flavour === 'affine:list') {
          if (selectedIds.has(parent.id)) {
            ancestors.unshift(
              createTaskIdentity({ docId: host.store.id, blockId: parent.id })
            );
          }
          parent = host.store.getParent(parent) as ListBlockModel | null;
        }
        hierarchyLevelByRowId.set(row.id, ancestors.length);
        const directParentIdentity = ancestors.at(-1);
        if (directParentIdentity) {
          parentTaskIdentityByRowId.set(row.id, directParentIdentity);
        }
        if (ancestors.length > 0) {
          ancestorTaskIdentitiesByRowId.set(
            row.id,
            encodeTaskAncestorIdentities(ancestors)
          );
        }
      }
      for (const model of orderedSelectedModels) {
        const rowModel = host.store.getModelById(model.id);
        if (rowModel) {
          host.store.moveBlocks([rowModel], databaseModel);
        }
      }
      if (listRows.length > 0) {
        const hierarchyLevelColumnId = addProperty(
          databaseModel,
          'end',
          databaseBlockProperties.numberColumnConfig.create(
            TASK_HIERARCHY_LEVEL_COLUMN_NAME
          )
        );
        const parentTaskIdentityColumnId = addProperty(
          databaseModel,
          'end',
          databaseBlockProperties.richTextColumnConfig.create(
            TASK_PARENT_IDENTIFIER_COLUMN_NAME
          )
        );
        const ancestorTaskIdentitiesColumnId = addProperty(
          databaseModel,
          'end',
          databaseBlockProperties.richTextColumnConfig.create(
            TASK_ANCESTOR_IDENTIFIERS_COLUMN_NAME
          )
        );
        for (const row of orderedSelectedModels) {
          updateCell(databaseModel, row.id, {
            columnId: hierarchyLevelColumnId,
            value: hierarchyLevelByRowId.get(row.id) ?? 0,
          });
          if (row.flavour !== 'affine:list') {
            continue;
          }
          const parentIdentity = parentTaskIdentityByRowId.get(row.id);
          if (parentIdentity) {
            updateCell(databaseModel, row.id, {
              columnId: parentTaskIdentityColumnId,
              value: new Text(parentIdentity),
            });
          }
          const ancestorIdentities = ancestorTaskIdentitiesByRowId.get(row.id);
          if (ancestorIdentities) {
            updateCell(databaseModel, row.id, {
              columnId: ancestorTaskIdentitiesColumnId,
              value: new Text(ancestorIdentities),
            });
          }
        }
      }
      addDatabaseViewWithoutCapture(datasource, viewType);
      host.selection.clear();
      return;
    }

    databaseModel.props.taskStatusInheritance =
      taskWorkflowDefaults.database.taskStatusInheritance;

    const listRows = collectTodoRowsPreorder(orderedSelectedModels);
    const hierarchyLevelByRowId = new Map<string, number>();
    const parentTaskIdentityByRowId = new Map<string, string | undefined>();
    const ancestorTaskIdentitiesByRowId = new Map<string, string | undefined>();
    const getHierarchyLevel = (row: ListBlockModel) => {
      let depth = 0;
      let parent = host.store.getParent(row) as ListBlockModel | null;
      while (
        parent?.flavour === 'affine:list' &&
        parent.props.type === 'todo'
      ) {
        depth += 1;
        parent = host.store.getParent(parent) as ListBlockModel | null;
      }
      return depth;
    };
    for (const row of listRows) {
      hierarchyLevelByRowId.set(row.id, getHierarchyLevel(row));
      const ancestors: string[] = [];
      let parent = host.store.getParent(row) as ListBlockModel | null;
      while (
        parent?.flavour === 'affine:list' &&
        parent.props.type === 'todo'
      ) {
        ancestors.unshift(
          createTaskIdentity({
            docId: host.store.id,
            blockId: parent.id,
          })
        );
        parent = host.store.getParent(parent) as ListBlockModel | null;
      }
      const directParentIdentity = ancestors.at(-1);
      if (directParentIdentity) {
        parentTaskIdentityByRowId.set(row.id, directParentIdentity);
      }
      if (ancestors.length > 0) {
        ancestorTaskIdentitiesByRowId.set(
          row.id,
          encodeTaskAncestorIdentities(ancestors)
        );
      }
    }

    const getTodoFieldConfigRoot = (row: ListBlockModel) => {
      let root: ListBlockModel = row;
      let parent = host.store.getParent(root) as ListBlockModel | null;
      while (
        parent?.flavour === 'affine:list' &&
        parent.props.type === 'todo'
      ) {
        root = parent;
        parent = host.store.getParent(root) as ListBlockModel | null;
      }
      return root;
    };
    const fieldDefsByRowId = new Map<
      string,
      Array<{ key: string; label: string; type: TodoFieldType }>
    >();
    const statusMappingByRowId = new Map<
      string,
      | {
          statusColumnName: string;
          doneTagLabel: string;
          notDoneTagLabel?: string;
        }
      | undefined
    >();
    for (const row of listRows) {
      const root = getTodoFieldConfigRoot(row);
      fieldDefsByRowId.set(
        row.id,
        root.props.todoFieldDefs ?? taskWorkflowDefaults.list.fieldDefs
      );
      statusMappingByRowId.set(row.id, root.props.todoDatabaseStatusMapping);
    }

    for (const row of listRows) {
      const rowModel = host.store.getModelById(row.id);
      if (!rowModel) {
        continue;
      }
      host.store.moveBlocks([rowModel], databaseModel);
    }
    const fieldDefs = new Map<string, { label: string; type: TodoFieldType }>();
    let statusColumnName =
      taskWorkflowDefaults.list.statusMapping.statusColumnName || 'Status';
    let doneTagLabel =
      taskWorkflowDefaults.list.statusMapping.doneTagLabel || 'Done';
    let notDoneTagLabel =
      taskWorkflowDefaults.list.statusMapping.notDoneTagLabel || undefined;

    for (const row of listRows) {
      for (const def of fieldDefsByRowId.get(row.id) ?? []) {
        fieldDefs.set(def.key, { label: def.label, type: def.type });
      }
      const statusMapping = statusMappingByRowId.get(row.id);
      if (statusMapping) {
        statusColumnName = statusMapping.statusColumnName || statusColumnName;
        doneTagLabel = statusMapping.doneTagLabel || doneTagLabel;
        notDoneTagLabel = statusMapping.notDoneTagLabel || undefined;
      }
    }

    const statusOptions = createTaskWorkflowStatusOptions(
      taskWorkflowDefaults,
      doneTagLabel
    );
    if (notDoneTagLabel) {
      statusOptions.unshift({
        id: 'not_done',
        value: notDoneTagLabel,
        color: 'var(--affine-tag-yellow)',
      });
    }
    const statusColumnId = addProperty(
      databaseModel,
      'end',
      databaseBlockProperties.selectColumnConfig.create(statusColumnName, {
        options: statusOptions,
      })
    );

    if (fieldDefs.size > 0) {
      const selectOptionsByKey = new Map<
        string,
        Map<string, { id: string; value: string; color: string }>
      >();
      const getSelectOptionNames = (value: unknown, multi: boolean) =>
        String(value ?? '')
          .split(multi ? ',' : '\u0000')
          .map(v => v.trim())
          .filter(Boolean);
      for (const [key, def] of fieldDefs) {
        if (def.type !== 'select' && def.type !== 'multi_select') continue;
        const options = new Map<
          string,
          { id: string; value: string; color: string }
        >();
        for (const row of listRows) {
          for (const name of getSelectOptionNames(
            row.props.todoFieldValues?.[key],
            def.type === 'multi_select'
          )) {
            if (!options.has(name)) {
              options.set(name, {
                id: nanoid(),
                value: name,
                color: 'var(--affine-tag-blue)',
              });
            }
          }
        }
        selectOptionsByKey.set(key, options);
      }
      const columnByKey = new Map<
        string,
        { id: string; type: TodoFieldType }
      >();
      for (const [key, def] of fieldDefs) {
        const selectOptions = [
          ...(selectOptionsByKey.get(key)?.values() ?? []),
        ];
        const columnId = addProperty(
          databaseModel,
          'end',
          def.type === 'number'
            ? databaseBlockProperties.numberColumnConfig.create(def.label)
            : def.type === 'progress'
              ? databaseBlockProperties.progressColumnConfig.create(def.label)
              : def.type === 'date'
                ? databaseBlockProperties.dateColumnConfig.create(def.label)
                : def.type === 'select'
                  ? databaseBlockProperties.selectColumnConfig.create(
                      def.label,
                      {
                        options: selectOptions,
                      }
                    )
                  : def.type === 'multi_select'
                    ? databaseBlockProperties.multiSelectColumnConfig.create(
                        def.label,
                        { options: selectOptions }
                      )
                    : databaseBlockProperties.richTextColumnConfig.create(
                        def.label
                      )
        );
        columnByKey.set(key, { id: columnId, type: def.type });
      }

      for (const row of listRows) {
        for (const [key, value] of Object.entries(
          row.props.todoFieldValues ?? {}
        )) {
          const column = columnByKey.get(key);
          if (!column) continue;
          const numericValue =
            column.type === 'number' || column.type === 'progress'
              ? Number(value)
              : undefined;
          if (
            (column.type === 'number' || column.type === 'progress') &&
            !Number.isFinite(numericValue)
          ) {
            continue;
          }
          if (
            column.type === 'progress' &&
            (numericValue == null || numericValue < 0 || numericValue > 100)
          ) {
            continue;
          }
          const dateValue =
            column.type === 'date' ? parseTaskDateFieldValue(value) : undefined;
          if (column.type === 'date' && dateValue == null) continue;
          const selectOptions = selectOptionsByKey.get(key);
          const selectValue =
            column.type === 'select'
              ? selectOptions?.get(String(value).trim())?.id
              : undefined;
          const multiSelectValue =
            column.type === 'multi_select'
              ? getSelectOptionNames(value, true)
                  .map(name => selectOptions?.get(name)?.id)
                  .filter((id): id is string => Boolean(id))
              : undefined;
          updateCell(databaseModel, row.id, {
            columnId: column.id,
            value:
              column.type === 'number' || column.type === 'progress'
                ? numericValue
                : column.type === 'date'
                  ? dateValue
                  : column.type === 'select'
                    ? selectValue
                    : column.type === 'multi_select'
                      ? multiSelectValue
                      : new Text(String(value)),
          });
        }
      }
    }

    const hierarchyLevelColumnId = addProperty(
      databaseModel,
      'end',
      databaseBlockProperties.numberColumnConfig.create(
        TASK_HIERARCHY_LEVEL_COLUMN_NAME
      )
    );
    const parentTaskIdentityColumnId = addProperty(
      databaseModel,
      'end',
      databaseBlockProperties.richTextColumnConfig.create(
        TASK_PARENT_IDENTIFIER_COLUMN_NAME
      )
    );
    const ancestorTaskIdentitiesColumnId = addProperty(
      databaseModel,
      'end',
      databaseBlockProperties.richTextColumnConfig.create(
        TASK_ANCESTOR_IDENTIFIERS_COLUMN_NAME
      )
    );

    for (const row of listRows) {
      if (row.props.checked) {
        updateCell(databaseModel, row.id, {
          columnId: statusColumnId,
          value: 'done',
        });
        updateTaskStatusState(databaseModel, row.id, {
          provenance: 'manual',
          manualLock: 'done_locked',
        });
      } else if (notDoneTagLabel) {
        updateCell(databaseModel, row.id, {
          columnId: statusColumnId,
          value: 'not_done',
        });
        updateTaskStatusState(databaseModel, row.id, {
          provenance: 'manual',
          manualLock: 'none',
        });
      }
      updateCell(databaseModel, row.id, {
        columnId: hierarchyLevelColumnId,
        value: hierarchyLevelByRowId.get(row.id) ?? 0,
      });
      const parentIdentity = parentTaskIdentityByRowId.get(row.id);
      if (parentIdentity) {
        updateCell(databaseModel, row.id, {
          columnId: parentTaskIdentityColumnId,
          value: new Text(parentIdentity),
        });
      }
      const ancestorIdentities = ancestorTaskIdentitiesByRowId.get(row.id);
      if (ancestorIdentities) {
        updateCell(databaseModel, row.id, {
          columnId: ancestorTaskIdentitiesColumnId,
          value: new Text(ancestorIdentities),
        });
      }

      updateCell(databaseModel, row.id, {
        columnId: TASK_INTEROP_COLUMN_ID,
        value: createDatabaseRowTaskInteropLink({
          docId: host.store.id,
          blockId: row.id,
          databaseId: databaseModel.id,
          sourceFlavor: row.flavour,
        }),
      });
    }

    addDatabaseViewWithoutCapture(datasource, viewType);

    const hideColumnByDefaultInViews = (columnId: string) => {
      for (const view of databaseModel.props.views) {
        if (view.mode === 'kanban') {
          updateView<ViewDataWithColumns>(databaseModel, view.id, data => {
            const columns = data.columns ?? [];
            const idx = columns.findIndex(column => column.id === columnId);
            if (idx >= 0) {
              const current = columns[idx];
              if (!current) return {};
              const next = [...columns];
              next[idx] = { ...current, hide: true };
              return { columns: next };
            }
            return { columns: [...columns, { id: columnId, hide: true }] };
          });
        }

        if (view.mode === 'table') {
          updateView<ViewDataWithColumns>(databaseModel, view.id, data => {
            const columns = data.columns ?? [];
            const idx = columns.findIndex(column => column.id === columnId);
            if (idx >= 0) {
              const current = columns[idx];
              if (!current) return {};
              const next = [...columns];
              next[idx] = { ...current, hide: true };
              return { columns: next };
            }
            return {
              columns: [...columns, { id: columnId, width: 180, hide: true }],
            };
          });
        }
      }
    };

    hideColumnByDefaultInViews(parentTaskIdentityColumnId);
    hideColumnByDefaultInViews(ancestorTaskIdentitiesColumnId);
    hideColumnByDefaultInViews(hierarchyLevelColumnId);

    const selectionManager = host.selection;
    selectionManager.clear();
  });
};
