import {
  addProperty,
  convertToDatabase,
  copyCellsByProperty,
  createTaskWorkflowStatusOptions,
  DatabaseBlockDataSource,
  databaseBlockProperties,
  databaseViewInitTemplate,
  deleteColumn,
  getCell,
  getProperty,
  parseTaskDateFieldValue,
  updateCell,
} from '@blocksuite/affine-block-database';
import {
  type CellDataType,
  type ColumnDataType,
  type DatabaseBlockModel,
  DatabaseBlockSchemaExtension,
  type ListBlockModel,
  ListBlockSchemaExtension,
  NoteBlockSchemaExtension,
  ParagraphBlockSchemaExtension,
  RootBlockSchemaExtension,
} from '@blocksuite/affine-model';
import {
  EditorSettingProvider,
  TaskWorkflowDefaultsSchema,
} from '@blocksuite/affine-shared/services';
import {
  createTaskIdentity,
  TASK_HIERARCHY_LEVEL_COLUMN_NAME,
  TASK_PARENT_IDENTIFIER_COLUMN_NAME,
} from '@blocksuite/affine-shared/utils';
import { EditorHostKey } from '@blocksuite/data-view';
import { propertyModelPresets } from '@blocksuite/data-view/property-pure-presets';
import type { BlockModel, Store } from '@blocksuite/store';
import { Text } from '@blocksuite/store';
import {
  createAutoIncrementIdGenerator,
  TestWorkspace,
} from '@blocksuite/store/test';
import { beforeEach, describe, expect, test } from 'vitest';

import { HeaderAreaTextCell } from '../../../../blocks/database/src/properties/title/text.js';
import { getTodoConfigFromProvider } from '../../../../blocks/list/src/todo-config.js';
import {
  parseTodoFieldDefs,
  serializeTodoFieldDefs,
  TODO_FIELD_TYPES_LABEL,
  TodoListSettingsModal,
} from '../../../../blocks/root/src/configs/todo-list-settings-modal.js';
import { getAttachedTodoConfigTargets } from '../../../../blocks/root/src/configs/todo-list-settings-utils.js';

const extensions = [
  RootBlockSchemaExtension,
  NoteBlockSchemaExtension,
  ParagraphBlockSchemaExtension,
  ListBlockSchemaExtension,
  DatabaseBlockSchemaExtension,
];

function createTestOptions() {
  const idGenerator = createAutoIncrementIdGenerator();
  return { id: 'test-collection', idGenerator };
}

function createTestDoc(docId = 'doc0') {
  const options = createTestOptions();
  const collection = new TestWorkspace(options);
  collection.meta.initialize();
  const doc = collection.createDoc(docId);
  doc.load();
  return doc.getStore({ extensions });
}

describe('DatabaseManager', () => {
  let doc: Store;
  let db: DatabaseBlockModel;

  let rootId: BlockModel['id'];
  let noteBlockId: BlockModel['id'];
  let databaseBlockId: BlockModel['id'];
  let p1: BlockModel['id'];
  let p2: BlockModel['id'];
  let col1: ColumnDataType['id'];
  let col2: ColumnDataType['id'];
  let col3: ColumnDataType['id'];

  const selection = [
    { id: '1', value: 'Done', color: 'var(--affine-tag-white)' },
    { id: '2', value: 'TODO', color: 'var(--affine-tag-pink)' },
    { id: '3', value: 'WIP', color: 'var(--affine-tag-blue)' },
  ];

  beforeEach(() => {
    doc = createTestDoc();

    rootId = doc.addBlock('affine:page', {
      title: new Text('database test'),
    });
    noteBlockId = doc.addBlock('affine:note', {}, rootId);

    databaseBlockId = doc.addBlock(
      'affine:database',
      {
        columns: [],
        titleColumn: 'Title',
      },
      noteBlockId
    );

    const databaseModel = doc.getModelById(
      databaseBlockId
    ) as DatabaseBlockModel;
    db = databaseModel;

    col1 = addProperty(
      db,
      'end',
      databaseBlockProperties.numberColumnConfig.create('Number')
    );
    col2 = addProperty(
      db,
      'end',
      propertyModelPresets.selectPropertyModelConfig.create('Single Select', {
        options: selection,
      })
    );
    col3 = addProperty(
      db,
      'end',
      databaseBlockProperties.richTextColumnConfig.create('Rich Text')
    );

    doc.updateBlock(databaseModel, {
      columns: [col1, col2, col3],
    });

    p1 = doc.addBlock(
      'affine:paragraph',
      {
        text: new Text('text1'),
      },
      databaseBlockId
    );
    p2 = doc.addBlock(
      'affine:paragraph',
      {
        text: new Text('text2'),
      },
      databaseBlockId
    );

    updateCell(db, p1, {
      columnId: col1,
      value: 0.1,
    });
    updateCell(db, p2, {
      columnId: col2,
      value: [selection[1]],
    });
  });

  test('getColumn', () => {
    const column = {
      ...databaseBlockProperties.numberColumnConfig.create('testColumnId'),
      id: 'testColumnId',
    };
    addProperty(db, 'end', column);

    const result = getProperty(db, column.id);
    expect(result).toEqual(column);
  });

  test('addColumn', () => {
    const column =
      databaseBlockProperties.numberColumnConfig.create('Test Column');
    const id = addProperty(db, 'end', column);
    const result = getProperty(db, id);

    expect(result).toMatchObject(column);
    expect(result).toHaveProperty('id');
  });

  test('deleteColumn', () => {
    const column = {
      ...databaseBlockProperties.numberColumnConfig.create('Test Column'),
      id: 'testColumnId',
    };
    addProperty(db, 'end', column);
    expect(getProperty(db, column.id)).toEqual(column);

    deleteColumn(db, column.id);
    expect(getProperty(db, column.id)).toBeUndefined();
  });

  test('getCell', () => {
    const modelId = doc.addBlock(
      'affine:paragraph',
      {
        text: new Text('paragraph'),
      },
      noteBlockId
    );
    const column = {
      ...databaseBlockProperties.numberColumnConfig.create('Test Column'),
      id: 'testColumnId',
    };
    const cell: CellDataType = {
      columnId: column.id,
      value: 42,
    };

    addProperty(db, 'end', column);
    updateCell(db, modelId, cell);

    const model = doc.getModelById(modelId);

    expect(model).not.toBeNull();

    const result = getCell(db, model!.id, column.id);
    expect(result).toEqual(cell);
  });

  test('updateCell', () => {
    const newRowId = doc.addBlock(
      'affine:paragraph',
      {
        text: new Text('text3'),
      },
      databaseBlockId
    );

    updateCell(db, newRowId, {
      columnId: col2,
      value: [selection[2]],
    });

    const cell = getCell(db, newRowId, col2);
    expect(cell).toEqual({
      columnId: col2,
      value: [selection[2]],
    });
  });

  test('copyCellsByColumn', () => {
    const newColId = addProperty(
      db,
      'end',
      propertyModelPresets.selectPropertyModelConfig.create('Copied Select', {
        options: selection,
      })
    );

    copyCellsByProperty(db, col2, newColId);

    const cell = getCell(db, p2, newColId);
    expect(cell).toEqual({
      columnId: newColId,
      value: [selection[1]],
    });
  });

  test('uses database-level task status inheritance defaults', () => {
    const dataSource = new DatabaseBlockDataSource(db);
    expect(dataSource.getTaskStatusInheritance()).toEqual({
      done: 'require-all-subtasks-complete',
      inProgress: 'start-when-any-subtask-starts',
      autoDemoteAutoDone: true,
      cascadeManualDoneToDescendants: true,
    });
    dataSource.setTaskStatusInheritance({ done: 'disabled' });
    expect(dataSource.getTaskStatusInheritance()).toEqual({
      done: 'disabled',
      inProgress: 'start-when-any-subtask-starts',
      autoDemoteAutoDone: true,
      cascadeManualDoneToDescendants: true,
    });
  });

  test('uses stable global task workflow defaults schema', () => {
    expect(TaskWorkflowDefaultsSchema.parse({})).toEqual({
      list: {
        fieldDefs: [],
        fieldLayout: 'aligned',
        statusMapping: {
          statusColumnName: 'Status',
          doneTagLabel: 'Done',
        },
      },
      database: {
        taskStatusInheritance: {
          done: 'require-all-subtasks-complete',
          inProgress: 'start-when-any-subtask-starts',
          autoDemoteAutoDone: true,
          cascadeManualDoneToDescendants: true,
        },
        kanbanColumns: ['Todo:todo', 'In Progress:in_progress', 'Done:done'],
        highlightAfterDueDate: 'highlight',
        hideFromCalendarWhenDone: true,
        showDueDateColumn: false,
      },
    });
  });

  test('parses expanded todo settings field types and defaults layout to aligned', () => {
    expect(
      parseTodoFieldDefs(
        'owner:select:Owner, tags:multi-select:Tags, due:date:Due, done:progress:Done, cost:number:Cost'
      )
    ).toEqual([
      { key: 'owner', type: 'select', label: 'Owner' },
      { key: 'tags', type: 'multi_select', label: 'Tags' },
      { key: 'due', type: 'date', label: 'Due' },
      { key: 'done', type: 'progress', label: 'Done' },
      { key: 'cost', type: 'number', label: 'Cost' },
    ]);
    expect(TODO_FIELD_TYPES_LABEL).toContain('date');
    expect(TODO_FIELD_TYPES_LABEL).toContain('select');
    expect(TODO_FIELD_TYPES_LABEL).toContain('multi_select');
    expect(TODO_FIELD_TYPES_LABEL).toContain('progress');
    expect(
      serializeTodoFieldDefs([
        { key: 'due', type: 'date', label: 'Due' },
        { key: 'owner', type: 'select', label: 'owner' },
      ])
    ).toBe('due:date:Due, owner:select');
    expect(new TodoListSettingsModal().initialLayout).toBe('aligned');
  });

  test('deduplicates todo settings field keys by keeping the first definition', () => {
    expect(
      parseTodoFieldDefs('owner:text:Owner, owner:select:Assignee')
    ).toEqual([{ key: 'owner', type: 'text', label: 'Owner' }]);
  });

  test('rejects spaces in todo field keys and uses label for display names', () => {
    expect(
      parseTodoFieldDefs('multi_select:multi_select:Multi Select')
    ).toEqual([
      { key: 'multi_select', type: 'multi_select', label: 'Multi Select' },
    ]);
    expect(parseTodoFieldDefs('Multi Select:multi_select')).toEqual([]);
  });

  test('todo settings modal keeps draft changes local until save', () => {
    const modal = new TodoListSettingsModal();
    const saved: unknown[] = [];
    modal.initialFields = [];
    modal.onSave = payload => saved.push(payload);
    modal.connectedCallback();

    modal.setFieldDraftForTesting('owner:text:Owner');

    expect(saved).toEqual([]);

    modal.saveForTesting();

    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      fields: [{ key: 'owner', type: 'text', label: 'Owner' }],
    });
  });

  test('todo settings save targets only attached todo roots provided by toolbar', () => {
    const root = {
      id: 'root',
      flavour: 'affine:list',
      props: { type: 'todo' },
    };
    const detached = {
      id: 'detached',
      flavour: 'affine:list',
      props: { type: 'todo' },
    };
    const parentById = new Map<string, unknown>([['root', { id: 'note' }]]);

    expect(
      getAttachedTodoConfigTargets(
        { getParent: model => parentById.get(model.id) },
        [root, detached] as never
      )
    ).toEqual([root]);
  });

  test('descendant todo config subscribes to inherited provider field signals', () => {
    const provider = {
      props: {
        todoFieldDefs: undefined,
        todoFieldLayout: undefined,
        todoFieldDefs$: {
          value: [{ key: 'owner', type: 'text', label: 'Owner' }],
        },
        todoFieldLayout$: { value: 'right' },
      },
    };

    expect(
      getTodoConfigFromProvider(provider as never, {
        fieldDefs: [],
        fieldLayout: 'aligned',
        statusMapping: { statusColumnName: 'Status', doneTagLabel: 'Done' },
      })
    ).toEqual({
      fieldDefs: [{ key: 'owner', type: 'text', label: 'Owner' }],
      layout: 'right',
    });
  });

  test('parses optional task date fields with unambiguous input only', () => {
    const dashed = parseTaskDateFieldValue('2026-06-05');
    const slashed = parseTaskDateFieldValue('2026/06/05');

    expect(typeof dashed).toBe('number');
    expect(slashed).toBe(dashed);
    expect(parseTaskDateFieldValue('06/05/2026')).toBeUndefined();
    expect(parseTaskDateFieldValue('2026-02-31')).toBeUndefined();
  });

  test('creates status options for every configured kanban column', () => {
    const defaults = TaskWorkflowDefaultsSchema.parse({
      database: {
        kanbanColumns: [
          'Todo:todo',
          'In Progress:in_progress',
          'Review:in_progress',
          'Done:done',
          'Not Doing:none',
        ],
      },
      list: {
        statusMapping: {
          doneTagLabel: 'Done',
        },
      },
    });

    expect(createTaskWorkflowStatusOptions(defaults, 'Done')).toEqual([
      {
        id: 'todo',
        value: 'Todo',
        color: 'var(--affine-tag-yellow)',
        semantic: 'todo',
      },
      {
        id: 'in_progress',
        value: 'In Progress',
        color: 'var(--affine-tag-blue)',
        semantic: 'in_progress',
      },
      {
        id: 'workflow_review',
        value: 'Review',
        color: 'var(--affine-tag-blue)',
        semantic: 'in_progress',
      },
      {
        id: 'done',
        value: 'Done',
        color: 'var(--affine-tag-green)',
        semantic: 'done',
      },
      {
        id: 'workflow_not_doing',
        value: 'Not Doing',
        color: 'var(--affine-tag-yellow)',
        semantic: 'none',
      },
    ]);

    expect(
      createTaskWorkflowStatusOptions(defaults, 'Finished').at(-1)
    ).toEqual({
      id: 'workflow_not_doing',
      value: 'Not Doing',
      color: 'var(--affine-tag-yellow)',
      semantic: 'none',
    });
    expect(
      createTaskWorkflowStatusOptions(defaults, 'Finished')
    ).toContainEqual({
      id: 'done',
      value: 'Finished',
      color: 'var(--affine-tag-green)',
      semantic: 'done',
    });
  });

  test('exposes canonical task status mapping helpers for checkbox consumers', () => {
    const options = [
      {
        id: 'todo',
        value: 'Todo',
        color: 'var(--affine-tag-yellow)',
        semantic: 'todo' as const,
      },
      {
        id: 'workflow_review',
        value: 'Review',
        color: 'var(--affine-tag-blue)',
        semantic: 'in_progress' as const,
      },
      {
        id: 'workflow_not_doing',
        value: 'Not Doing',
        color: 'var(--affine-tag-yellow)',
        semantic: 'none' as const,
      },
      {
        id: 'done',
        value: 'Finished',
        color: 'var(--affine-tag-green)',
        semantic: 'done' as const,
      },
    ];
    const statusColumnId = addProperty(
      db,
      'end',
      propertyModelPresets.selectPropertyModelConfig.create('State', {
        options,
      })
    );

    const dataSource = new DatabaseBlockDataSource(db);
    expect(dataSource.getTaskStatusColumn()?.id).toBe(statusColumnId);
    expect(dataSource.getTaskStatusTargetOption('done')?.id).toBe('done');
    expect(dataSource.getTaskStatusTargetOption('todo')?.id).toBe('todo');

    updateCell(db, p1, { columnId: statusColumnId, value: 'done' });
    expect(dataSource.getTaskStatusInfo(p1)).toMatchObject({
      columnId: statusColumnId,
      selectedOptionId: 'done',
      semantic: 'done',
      checked: true,
    });

    updateCell(db, p1, {
      columnId: statusColumnId,
      value: { id: 'workflow_review' },
    });
    expect(dataSource.getTaskStatusInfo(p1)).toMatchObject({
      selectedOptionId: 'workflow_review',
      semantic: 'in_progress',
      checked: false,
    });

    updateCell(db, p1, {
      columnId: statusColumnId,
      value: [{ id: 'workflow_not_doing' }],
    });
    expect(dataSource.getTaskStatusInfo(p1)).toMatchObject({
      selectedOptionId: 'workflow_not_doing',
      semantic: 'none',
      checked: false,
    });
  });

  test('maps legacy not_done status option to todo semantic', () => {
    const options = [
      { id: 'not_done', value: 'Open', color: 'var(--affine-tag-yellow)' },
      { id: 'done', value: 'Finished', color: 'var(--affine-tag-green)' },
    ];
    const statusColumnId = addProperty(
      db,
      'end',
      propertyModelPresets.selectPropertyModelConfig.create('Status', {
        options,
      })
    );
    updateCell(db, p1, { columnId: statusColumnId, value: 'not_done' });

    const dataSource = new DatabaseBlockDataSource(db);
    expect(dataSource.getTaskStatusTargetOption('todo')?.id).toBe('not_done');
    expect(dataSource.getTaskStatusInfo(p1)).toMatchObject({
      selectedOptionId: 'not_done',
      semantic: 'todo',
      checked: false,
    });
  });

  test('task status checkbox toggle uses status change path for roll-up and configured targets', () => {
    const options = [
      { id: 'not_done', value: 'Open', color: 'var(--affine-tag-yellow)' },
      { id: 'done', value: 'Finished', color: 'var(--affine-tag-green)' },
    ];
    const statusColumnId = addProperty(
      db,
      'end',
      propertyModelPresets.selectPropertyModelConfig.create('Status', {
        options,
      })
    );
    const parentIdentityColumnId = addProperty(
      db,
      'end',
      databaseBlockProperties.richTextColumnConfig.create(
        TASK_PARENT_IDENTIFIER_COLUMN_NAME
      )
    );
    const parent = doc.addBlock(
      'affine:paragraph',
      { text: new Text('parent') },
      databaseBlockId
    );
    const child = doc.addBlock(
      'affine:paragraph',
      { text: new Text('child') },
      databaseBlockId
    );
    updateCell(db, child, {
      columnId: parentIdentityColumnId,
      value: new Text(createTaskIdentity({ docId: doc.id, blockId: parent })),
    });

    const dataSource = new DatabaseBlockDataSource(db);
    dataSource.setTaskStatusChecked(child, true);
    expect(getCell(db, child, statusColumnId)?.value).toBe('done');
    expect(getCell(db, parent, statusColumnId)?.value).toBe('done');
    expect(dataSource.getTaskStatusInfo(child)?.checked).toBe(true);

    dataSource.setTaskStatusChecked(child, false);
    expect(getCell(db, child, statusColumnId)?.value).toBe('not_done');
    expect(getCell(db, parent, statusColumnId)?.value).toBe('not_done');
    expect(dataSource.getTaskStatusInfo(child)?.checked).toBe(false);
  });

  test('setTaskStatusChecked auto-stamps and clears a hidden "Done date" column', () => {
    const options = [
      { id: 'not_done', value: 'Open', color: 'var(--affine-tag-yellow)' },
      { id: 'done', value: 'Finished', color: 'var(--affine-tag-green)' },
    ];
    addProperty(
      db,
      'end',
      propertyModelPresets.selectPropertyModelConfig.create('Status', {
        options,
      })
    );

    const dataSource = new DatabaseBlockDataSource(db);
    const doneDateColumnId = dataSource.ensureDoneDateColumn();
    expect(doneDateColumnId).toBeTruthy();
    expect(getCell(db, p1, doneDateColumnId!)?.value ?? null).toBeNull();

    const before = Date.now();
    dataSource.setTaskStatusChecked(p1, true);
    const stamped = getCell(db, p1, doneDateColumnId!)?.value;
    expect(typeof stamped).toBe('number');
    expect(stamped as number).toBeGreaterThanOrEqual(before);

    dataSource.setTaskStatusChecked(p1, false);
    expect(getCell(db, p1, doneDateColumnId!)?.value ?? null).toBeNull();
  });

  test('creates list database view through generic view initialization without converting initial rows', () => {
    const listDatabaseId = doc.addBlock(
      'affine:database',
      { columns: [], titleColumn: 'Title' },
      noteBlockId
    );
    const listDatabase = doc.getModelById(listDatabaseId) as DatabaseBlockModel;
    const dataSource = new DatabaseBlockDataSource(listDatabase);

    databaseViewInitTemplate(dataSource, 'list');

    expect(listDatabase.props.views.some(view => view.mode === 'list')).toBe(
      true
    );
    expect(dataSource.getTaskStatusColumn()?.name).toBe('Status');
    expect(
      listDatabase.children.every(child => child.flavour !== 'affine:list')
    ).toBe(true);
  });

  test('adds database list-view rows as todo list blocks', () => {
    const dataSource = new DatabaseBlockDataSource(db);

    const rowId = dataSource.rowAddAsTodoList('end');
    const row = doc.getModelById(rowId) as ListBlockModel | null;

    expect(row?.flavour).toBe('affine:list');
    expect(row?.props.type).toBe('todo');
    expect(row?.props.checked).toBe(false);
  });

  test('creates a task status "Status" column eagerly for list-view row creation, not only once a view configures it', () => {
    // Status is meant to be the single, always-present source of truth for
    // a todo row's state (this is what auto-promotion/cascade is built
    // around) — it must exist the moment the first todo row does, exactly
    // like the hierarchy columns already do, rather than only appearing as
    // a side effect of `databaseViewInitTemplate`'s kanban/list branch or
    // Kanban's own groupBy fallback. Relying on those meant a database
    // whose only view was ever "table" could have live todo rows with no
    // Status column at all, silently falling back to `affine:list`'s own
    // plain `checked` boolean — a separate, non-cascading storage mechanism
    // this behavior no longer exercises.
    const dataSource = new DatabaseBlockDataSource(db);

    const rowId = dataSource.rowAddAsTodoList('end');
    const levelColumn = db.props.columns.find(
      column => column.name === TASK_HIERARCHY_LEVEL_COLUMN_NAME
    );

    expect(dataSource.getTaskStatusColumn()).toBeTruthy();
    expect(db.props.columns.map(column => column.name)).toContain('Status');
    expect(levelColumn).toBeTruthy();
    expect(getCell(db, rowId, levelColumn!.id)?.value).toBe(0);
    // A fresh todo row starts with no Status value at all (a genuine
    // "no status yet" state) — not pre-assigned to the "todo" option,
    // which is a real, selectable value someone can set later.
    expect(
      dataSource.getTaskStatusInfo(rowId)?.selectedOptionId
    ).toBeUndefined();
    expect(dataSource.getTaskStatusInfo(rowId)?.checked).toBe(false);
  });

  test('the Status column is visible by default in table view but hidden in list/kanban (toggleable via the properties panel), both for views that existed when it was created and views added afterwards', () => {
    const dataSource = new DatabaseBlockDataSource(db);

    // A table view already exists *before* any todo row/Status column
    // does — exercises `hidePropertyInViews`'s own "existing views at
    // creation time" path.
    const tableViewId = dataSource.viewManager.viewAdd('table');
    dataSource.rowAddAsTodoList('end');

    // A list view added *afterwards*, once the Status column already
    // exists — exercises `hideDefaultHiddenColumnsForNewView`, called from
    // `viewDataAdd`/`viewDataAddWithoutCapture` for exactly this case.
    const listViewId = dataSource.viewManager.viewAdd('list');

    const statusColumn = dataSource.getTaskStatusColumn()!;
    expect(statusColumn).toBeTruthy();

    const findHide = (viewId: string) => {
      const view = db.props.views.find(v => v.id === viewId) as
        | { columns?: { id: string; hide?: boolean }[] }
        | undefined;
      return view?.columns?.find(c => c.id === statusColumn.id)?.hide;
    };
    // Table view: Status is a real, directly useful property — stays
    // visible (either absent from the hide-list, or explicitly `false`).
    expect(findHide(tableViewId)).not.toBe(true);
    // List view: redundant with the checkbox — hidden by default.
    expect(findHide(listViewId)).toBe(true);
  });

  test('the "Done date" column follows the same visible-in-table/hidden-elsewhere policy as Status', () => {
    const dataSource = new DatabaseBlockDataSource(db);

    const tableViewId = dataSource.viewManager.viewAdd('table');
    const rowId = dataSource.rowAddAsTodoList('end');
    dataSource.setTaskStatusChecked(rowId, true); // creates the Done date column
    const listViewId = dataSource.viewManager.viewAdd('list');

    const doneDateColumn = dataSource.getDoneDateColumn()!;
    expect(doneDateColumn).toBeTruthy();

    const findHide = (viewId: string) => {
      const view = db.props.views.find(v => v.id === viewId) as
        | { columns?: { id: string; hide?: boolean }[] }
        | undefined;
      return view?.columns?.find(c => c.id === doneDateColumn.id)?.hide;
    };
    expect(findHide(tableViewId)).not.toBe(true);
    expect(findHide(listViewId)).toBe(true);
  });

  test('Story 2.7: "Due date" column is idempotent, positioned right after Done date, hidden everywhere by default (including table, per direct user instruction — see the `showDueDateColumn` setting test below), and is directly cell-editable (unlike every other system column)', () => {
    const dataSource = new DatabaseBlockDataSource(db);

    const tableViewId = dataSource.viewManager.viewAdd('table');
    const listViewId = dataSource.viewManager.viewAdd('list');

    const dueDateColumnId = dataSource.ensureDueDateColumn();
    const dueDateColumnIdAgain = dataSource.ensureDueDateColumn();
    expect(dueDateColumnId).toBeTruthy();
    expect(dueDateColumnIdAgain).toBe(dueDateColumnId);

    const doneDateColumn = dataSource.getDoneDateColumn()!;
    expect(doneDateColumn).toBeTruthy();
    const masterColumnIds = db.props.columns.map(c => c.id);
    expect(masterColumnIds.indexOf(dueDateColumnId!)).toBe(
      masterColumnIds.indexOf(doneDateColumn.id) + 1
    );

    const findHide = (viewId: string) => {
      const view = db.props.views.find(v => v.id === viewId) as
        | { columns?: { id: string; hide?: boolean }[] }
        | undefined;
      return view?.columns?.find(c => c.id === dueDateColumnId)?.hide;
    };
    // No `std` passed (and no `EditorSettingProvider` registered even if it
    // were) — `showDueDateColumn` resolves to its schema default (`false`),
    // so the column starts hidden in table too, not just non-table views.
    expect(findHide(tableViewId)).toBe(true);
    expect(findHide(listViewId)).toBe(true);

    // Unlike Done date/Status/Note/Note color (all auto-managed, never
    // directly editable), Due date is a user-set value — AC1 requires it
    // be directly writable via the table cell.
    expect(dataSource.propertyReadonlyGet(dueDateColumnId!)).toBe(false);
  });

  test('Story 2.7: "showDueDateColumn" setting controls the Due date column\'s table visibility at creation time only — a manual per-table override afterward is never re-synced away', () => {
    const dataSource = new DatabaseBlockDataSource(db);
    const tableViewId = dataSource.viewManager.viewAdd('table');

    const findHide = (viewId: string, columnId: string) => {
      const view = db.props.views.find(v => v.id === viewId) as
        | { columns?: { id: string; hide?: boolean }[] }
        | undefined;
      return view?.columns?.find(c => c.id === columnId)?.hide;
    };

    const stubStdShow = {
      getOptional: (identifier: unknown) =>
        identifier === EditorSettingProvider
          ? {
              setting$: {
                peek: () => ({
                  taskWorkflowDefaults: TaskWorkflowDefaultsSchema.parse({
                    database: { showDueDateColumn: true },
                  }),
                }),
                get value() {
                  return {
                    taskWorkflowDefaults: TaskWorkflowDefaultsSchema.parse({
                      database: { showDueDateColumn: true },
                    }),
                  };
                },
              },
            }
          : undefined,
    } as never;

    const dueDateColumnId = dataSource.ensureDueDateColumn(stubStdShow)!;
    expect(findHide(tableViewId, dueDateColumnId)).not.toBe(true);

    // Calling `ensureDueDateColumn` again — even with the setting now
    // implying `false` — must NOT touch the already-established hide
    // state (creation-time-only default, not a live resync).
    const stubStdHide = { getOptional: () => undefined } as never;
    dataSource.ensureDueDateColumn(stubStdHide);
    expect(findHide(tableViewId, dueDateColumnId)).not.toBe(true);
  });

  test('Story 2.7: a brand new table view (added after the Due date column already exists, e.g. via the generic view-switcher) respects the live "showDueDateColumn" setting, not just a table view that predates the column', () => {
    // Regression for the exact bug the user hit live: toggling the global
    // setting, then adding a *new* table view — `ensureDueDateColumn`'s own
    // creation-time default only covers a table view that already existed
    // *before* the column did; every other new-view-creation path goes
    // through `hideDefaultHiddenColumnsForNewView` instead (resolves `std`
    // internally via `EditorHostKey`, since `viewDataAdd`'s own generic
    // `DataSource` interface signature has no `std` parameter to thread
    // through).
    const dataSource = new DatabaseBlockDataSource(db, ds => {
      ds.serviceSet(EditorHostKey, {
        std: {
          getOptional: (identifier: unknown) =>
            identifier === EditorSettingProvider
              ? {
                  setting$: {
                    peek: () => ({
                      taskWorkflowDefaults: TaskWorkflowDefaultsSchema.parse({
                        database: { showDueDateColumn: true },
                      }),
                    }),
                    get value() {
                      return {
                        taskWorkflowDefaults: TaskWorkflowDefaultsSchema.parse({
                          database: { showDueDateColumn: true },
                        }),
                      };
                    },
                  },
                }
              : undefined,
        },
      } as never);
    });

    // Column already exists, created with the setting off (hidden).
    const dueDateColumnId = dataSource.ensureDueDateColumn({
      getOptional: () => undefined,
    } as never)!;

    // A brand new table view, added *after* the column exists and *after*
    // the live setting was switched on — should start visible.
    const newTableViewId = dataSource.viewManager.viewAdd('table');
    const view = db.props.views.find(v => v.id === newTableViewId) as
      | { columns?: { id: string; hide?: boolean }[] }
      | undefined;
    expect(view?.columns?.find(c => c.id === dueDateColumnId)?.hide).not.toBe(
      true
    );
  });

  test('Story 2.7: the setting also applies to a brand new *list* view (i.e. `/Journal Todo` itself) — Due date is not unconditionally hidden in list/kanban the way Status/Done date/Note are', () => {
    // Regression for the second round of live feedback: "Journal Todo" is
    // a list-mode view, not a table — the user's own expectation was that
    // enabling the setting and creating a new journal todo would surface
    // the column right there, not only in some separate table view.
    const dataSource = new DatabaseBlockDataSource(db, ds => {
      ds.serviceSet(EditorHostKey, {
        std: {
          getOptional: (identifier: unknown) =>
            identifier === EditorSettingProvider
              ? {
                  setting$: {
                    peek: () => ({
                      taskWorkflowDefaults: TaskWorkflowDefaultsSchema.parse({
                        database: { showDueDateColumn: true },
                      }),
                    }),
                    get value() {
                      return {
                        taskWorkflowDefaults: TaskWorkflowDefaultsSchema.parse({
                          database: { showDueDateColumn: true },
                        }),
                      };
                    },
                  },
                }
              : undefined,
        },
      } as never);
    });

    // Status/Done date/Due date all ensured *before* the view is created —
    // mirroring the real `/Journal Todo` sequence (eager-ensure happens
    // first, the list view is seeded after).
    const statusColumnId = dataSource.ensureTaskStatusColumn();
    const dueDateColumnId = dataSource.ensureDueDateColumn({
      getOptional: () => undefined,
    } as never)!;
    const doneDateColumnId = dataSource.getDoneDateColumn()!.id;

    const newListViewId = dataSource.viewManager.viewAdd('list');
    const view = db.props.views.find(v => v.id === newListViewId) as
      | { columns?: { id: string; hide?: boolean }[] }
      | undefined;
    expect(view?.columns?.find(c => c.id === dueDateColumnId)?.hide).not.toBe(
      true
    );

    // Status/Done date/Note stay unconditionally hidden in list regardless
    // of this setting — they have their own always-available list-mode
    // representations (checkbox, row-hover button), unlike Due date.
    expect(view?.columns?.find(c => c.id === statusColumnId)?.hide).toBe(true);
    expect(view?.columns?.find(c => c.id === doneDateColumnId)?.hide).toBe(
      true
    );
  });

  test('Story 2.7: "Highlight after due date" follows the live global default when no per-table override is set, and the per-table override wins once set', () => {
    const dataSource = new DatabaseBlockDataSource(db);

    const stubStdNoProvider = { getOptional: () => undefined } as never;
    // No `EditorSettingProvider` registered at all — falls through to the
    // schema's own default (`highlight`), same fallback shape as
    // `list-block.ts`'s own `?? {}` regression fix.
    expect(dataSource.getHighlightAfterDueDateSetting(stubStdNoProvider)).toBe(
      'highlight'
    );

    const stubStdWithProvider = {
      getOptional: () => ({
        setting$: {
          peek: () => ({
            taskWorkflowDefaults: TaskWorkflowDefaultsSchema.parse({
              database: { highlightAfterDueDate: 'hide' },
            }),
          }),
          get value() {
            return {
              taskWorkflowDefaults: TaskWorkflowDefaultsSchema.parse({
                database: { highlightAfterDueDate: 'hide' },
              }),
            };
          },
        },
      }),
    } as never;
    expect(
      dataSource.getHighlightAfterDueDateSetting(stubStdWithProvider)
    ).toBe('hide');

    dataSource.setHighlightAfterDueDateOverride('off');
    expect(
      dataSource.getHighlightAfterDueDateSetting(stubStdWithProvider)
    ).toBe('off');

    dataSource.setHighlightAfterDueDateOverride(undefined);
    expect(
      dataSource.getHighlightAfterDueDateSetting(stubStdWithProvider)
    ).toBe('hide');
  });

  test('Story 2.7: getDueDateHighlightState resolves highlight/hide only for a past-due, undone row, comparing against journal date when available', () => {
    const dataSource = new DatabaseBlockDataSource(db);
    const rowId = dataSource.rowAddAsTodoList('end');
    const dueDateColumnId = dataSource.ensureDueDateColumn()!;

    const makeStub = (
      settingValue: 'highlight' | 'hide' | 'off',
      journalDate: string | undefined
    ) =>
      ({
        store: { id: 'stub-doc' },
        getOptional: (identifier: unknown) => {
          if (identifier === EditorSettingProvider) {
            return {
              setting$: {
                peek: () => ({
                  taskWorkflowDefaults: TaskWorkflowDefaultsSchema.parse({
                    database: { highlightAfterDueDate: settingValue },
                  }),
                }),
                get value() {
                  return {
                    taskWorkflowDefaults: TaskWorkflowDefaultsSchema.parse({
                      database: { highlightAfterDueDate: settingValue },
                    }),
                  };
                },
              },
            };
          }
          // Stands in for `JournalTodoDatabaseProvider`.
          return { getJournalDate: () => journalDate };
        },
      }) as never;

    // No Due date set yet.
    expect(
      dataSource.getDueDateHighlightState(
        makeStub('highlight', undefined),
        rowId
      )
    ).toBe(null);

    // Due date in the past (relative to wall-clock, no journal context).
    updateCell(db, rowId, {
      columnId: dueDateColumnId,
      value: Date.now() - 24 * 60 * 60 * 1000,
    });
    expect(
      dataSource.getDueDateHighlightState(
        makeStub('highlight', undefined),
        rowId
      )
    ).toBe('highlight');
    expect(
      dataSource.getDueDateHighlightState(makeStub('hide', undefined), rowId)
    ).toBe('hide');
    expect(
      dataSource.getDueDateHighlightState(makeStub('off', undefined), rowId)
    ).toBe(null);

    // Journal date overrides wall-clock: a journal page dated *before* the
    // due date means the row isn't overdue yet from that page's own
    // perspective, even though the due date is in the real past.
    const pastJournalDate = new Date(Date.now() - 48 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    expect(
      dataSource.getDueDateHighlightState(
        makeStub('highlight', pastJournalDate),
        rowId
      )
    ).toBe(null);

    // Marking the row Done suppresses the highlight regardless of due date.
    dataSource.setTaskStatusChecked(rowId, true);
    expect(
      dataSource.getDueDateHighlightState(
        makeStub('highlight', undefined),
        rowId
      )
    ).toBe(null);
  });

  test("Story 2.7 (Task 4): resolveJournalTodoNavigationDate resolves today's date for an undone row, and the row's Done date once marked done", () => {
    const dataSource = new DatabaseBlockDataSource(db);
    const rowId = dataSource.rowAddAsTodoList('end');

    const todayLocal = (() => {
      const d = new Date();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    })();

    // Undone — always resolves to today, regardless of any Due date.
    expect(dataSource.resolveJournalTodoNavigationDate(rowId)).toBe(todayLocal);

    // Marked done — resolves to the row's own (auto-stamped) Done date,
    // not today, even if "today" and the Done date happen to differ.
    dataSource.setTaskStatusChecked(rowId, true);
    const doneDateColumnId = dataSource.getDoneDateColumn()!.id;
    const pastDoneDate = new Date('2026-01-15T12:00:00');
    updateCell(db, rowId, {
      columnId: doneDateColumnId,
      value: pastDoneDate.getTime(),
    });
    expect(dataSource.resolveJournalTodoNavigationDate(rowId)).toBe(
      '2026-01-15'
    );

    // Un-marking clears the Done date back to `null` (existing behavior) —
    // falls back to today again.
    dataSource.setTaskStatusChecked(rowId, false);
    expect(dataSource.resolveJournalTodoNavigationDate(rowId)).toBe(todayLocal);
  });

  test('todo list rows track checkbox state through the task status column, not the plain affine:list.checked boolean', () => {
    const dataSource = new DatabaseBlockDataSource(db);
    const rowId = dataSource.rowAddAsTodoList('end');

    expect(dataSource.getTaskStatusColumn()).toBeTruthy();
    expect(dataSource.getTaskStatusInfo(rowId)?.checked).toBe(false);

    dataSource.setTaskStatusChecked(rowId, true);

    expect(dataSource.getTaskStatusInfo(rowId)?.checked).toBe(true);
    expect(dataSource.getTaskStatusColumn()).toBeTruthy();
  });

  test('converts an empty paragraph row to todo list in place', () => {
    const emptyRowId = doc.addBlock('affine:paragraph', {}, databaseBlockId);
    updateCell(db, emptyRowId, { columnId: col1, value: 42 });
    const dataSource = new DatabaseBlockDataSource(db);

    expect(dataSource.ensureRowAsTodoList(emptyRowId)).toBe(true);

    const row = doc.getModelById(emptyRowId) as ListBlockModel | null;
    expect(row?.id).toBe(emptyRowId);
    expect(row?.flavour).toBe('affine:list');
    expect(row?.props.type).toBe('todo');
    expect(row?.props.checked).toBe(false);
    expect(getCell(db, emptyRowId, col1)?.value).toBe(42);
  });

  test('preserves non-empty paragraph and existing list row types in list view initialization', () => {
    const emptyRowId = doc.addBlock('affine:paragraph', {}, databaseBlockId);
    const bulletRowId = doc.addBlock(
      'affine:list',
      { type: 'bulleted', text: new Text('bullet') },
      databaseBlockId
    );
    const numberedRowId = doc.addBlock(
      'affine:list',
      { type: 'numbered', text: new Text('number') },
      databaseBlockId
    );
    const todoRowId = doc.addBlock(
      'affine:list',
      { type: 'todo', text: new Text('todo') },
      databaseBlockId
    );
    const dataSource = new DatabaseBlockDataSource(db);

    expect(dataSource.ensureRowAsTodoList(p1)).toBe(false);
    expect(dataSource.ensureRowAsTodoList(bulletRowId)).toBe(false);
    expect(dataSource.ensureRowAsTodoList(numberedRowId)).toBe(false);
    expect(dataSource.ensureRowAsTodoList(todoRowId)).toBe(true);
    expect(dataSource.ensureRowAsTodoList(emptyRowId)).toBe(true);

    expect(doc.getModelById(p1)?.flavour).toBe('affine:paragraph');
    expect(
      (doc.getModelById(bulletRowId) as ListBlockModel | null)?.props.type
    ).toBe('bulleted');
    expect(
      (doc.getModelById(numberedRowId) as ListBlockModel | null)?.props.type
    ).toBe('numbered');
    expect(
      (doc.getModelById(todoRowId) as ListBlockModel | null)?.props.type
    ).toBe('todo');
  });

  test('does not infer task status from arbitrary Status select column name', () => {
    const arbitraryDatabaseId = doc.addBlock(
      'affine:database',
      { columns: [], titleColumn: 'Title' },
      noteBlockId
    );
    const arbitraryDatabase = doc.getModelById(
      arbitraryDatabaseId
    ) as DatabaseBlockModel;
    addProperty(
      arbitraryDatabase,
      'end',
      propertyModelPresets.selectPropertyModelConfig.create('Status', {
        options: [
          { id: 'blocked', value: 'Blocked', color: 'var(--affine-tag-red)' },
          { id: 'ready', value: 'Ready', color: 'var(--affine-tag-green)' },
        ],
      })
    );

    expect(
      new DatabaseBlockDataSource(arbitraryDatabase).getTaskStatusColumn()
    ).toBeUndefined();
  });

  test('task checkbox render path does not create cells during render', () => {
    expect(
      HeaderAreaTextCell.prototype.renderTaskStatusCheckbox.toString()
    ).not.toContain('cellGetOrCreate(this.cell.rowId, statusColumn.id)');
  });

  test('task checkbox render falls back to todo row state without status column', () => {
    const dataSource = new DatabaseBlockDataSource(db);
    const rowId = dataSource.rowAddAsTodoList('end');
    const cell = {
      cell: {
        rowId,
        view: {
          manager: { dataSource },
        },
      },
      readonly: false,
    };
    Object.setPrototypeOf(cell, HeaderAreaTextCell.prototype);

    expect(
      HeaderAreaTextCell.prototype.renderTaskStatusCheckbox.call(cell)
    ).toBeTruthy();
  });

  test('database title cell lets list-view Enter and Tab reach list row handlers', () => {
    expect(HeaderAreaTextCell.toString()).toContain(
      'this.view.type === "list"'
    );
    expect(HeaderAreaTextCell.toString()).toContain('event.key === "Enter"');
    expect(HeaderAreaTextCell.toString()).toContain('event.key === "Tab"');
    expect(HeaderAreaTextCell.prototype.renderBlockText.toString()).toContain(
      '@keydown'
    );
  });

  test('database title cell initializes empty rows when mounted in list view', () => {
    const emptyRowId = doc.addBlock('affine:paragraph', {}, databaseBlockId);
    const dataSource = new DatabaseBlockDataSource(db);
    const cell = {
      cell: {
        rowId: emptyRowId,
        property: { type$: { value: 'title' }, readonly$: { value: false } },
        value$: { value: doc.getModelById(emptyRowId)?.text },
        view: {
          type: 'list',
          manager: { dataSource },
          mainProperties$: { value: {} },
        },
      },
      requestUpdate: () => {},
    };
    Object.setPrototypeOf(cell, HeaderAreaTextCell.prototype);

    HeaderAreaTextCell.prototype['ensureTodoListRowWhenMounted'].call(cell);

    const row = doc.getModelById(emptyRowId) as ListBlockModel | null;
    expect(row?.flavour).toBe('affine:list');
    expect(row?.props.type).toBe('todo');
    expect(dataSource.getTaskStatusColumn()).toBeTruthy();
    expect(db.props.columns.map(column => column.name)).toContain('Status');
    expect(db.props.columns.map(column => column.name)).toContain(
      TASK_HIERARCHY_LEVEL_COLUMN_NAME
    );
  });

  test.each([
    [
      'affine:paragraph',
      { text: new Text('Plain text row') },
      'Plain text row',
    ],
    [
      'affine:list',
      { type: 'bulleted', text: new Text('Bulleted row') },
      'Bulleted row',
    ],
    [
      'affine:list',
      { type: 'numbered', text: new Text('Numbered row') },
      'Numbered row',
    ],
  ] as const)(
    'uses vanilla database conversion for non-todo %s selection',
    (flavour, props, expectedText) => {
      const blockId = doc.addBlock(flavour, props, noteBlockId);
      const selectedModels = [doc.getModelById(blockId)];

      convertToDatabase(
        {
          store: doc,
          selection: {
            clear: () => {},
          },
          std: {
            command: {
              exec: () => [null, { selectedModels }],
            },
            getOptional: () => ({
              setting$: {
                peek: () => ({ taskWorkflowDefaults: {} }),
                get value() {
                  return { taskWorkflowDefaults: {} };
                },
              },
            }),
          },
        } as never,
        'table'
      );

      const convertedDatabase = doc
        .getModelById(noteBlockId)
        ?.children.find(
          child =>
            child.flavour === 'affine:database' && child.id !== databaseBlockId
        ) as DatabaseBlockModel | undefined;

      expect(
        convertedDatabase?.children.map(child => child.text?.toString())
      ).toEqual([expectedText]);
    }
  );

  test('uses vanilla database conversion for mixed todo and non-todo selections', () => {
    const todoId = doc.addBlock(
      'affine:list',
      { type: 'todo', text: new Text('Todo row') },
      noteBlockId
    );
    const paragraphId = doc.addBlock(
      'affine:paragraph',
      { text: new Text('Plain row') },
      noteBlockId
    );
    const selectedModels = [
      doc.getModelById(todoId),
      doc.getModelById(paragraphId),
    ];

    convertToDatabase(
      {
        store: doc,
        selection: {
          clear: () => {},
        },
        std: {
          command: {
            exec: () => [null, { selectedModels }],
          },
          getOptional: () => ({
            setting$: {
              peek: () => ({ taskWorkflowDefaults: {} }),
              get value() {
                return { taskWorkflowDefaults: {} };
              },
            },
          }),
        },
      } as never,
      'table'
    );

    const convertedDatabase = doc
      .getModelById(noteBlockId)
      ?.children.find(
        child =>
          child.flavour === 'affine:database' && child.id !== databaseBlockId
      ) as DatabaseBlockModel | undefined;

    expect(
      convertedDatabase?.children.map(child => child.text?.toString())
    ).toEqual(['Todo row', 'Plain row']);
    expect(
      convertedDatabase?.props.columns.map(column => column.name)
    ).toContain(TASK_HIERARCHY_LEVEL_COLUMN_NAME);
  });

  test('preserves mixed text/list/todo conversion order and list indentation metadata', () => {
    const paragraphId = doc.addBlock(
      'affine:paragraph',
      { text: new Text('Plain row') },
      noteBlockId
    );
    const bulletParentId = doc.addBlock(
      'affine:list',
      { type: 'bulleted', text: new Text('Bullet parent') },
      noteBlockId
    );
    const bulletChildId = doc.addBlock(
      'affine:list',
      { type: 'bulleted', text: new Text('Bullet child') },
      bulletParentId
    );
    const numberedId = doc.addBlock(
      'affine:list',
      { type: 'numbered', text: new Text('Numbered row') },
      noteBlockId
    );
    const todoId = doc.addBlock(
      'affine:list',
      { type: 'todo', text: new Text('Todo row') },
      noteBlockId
    );
    const selectedModels = [
      paragraphId,
      bulletParentId,
      bulletChildId,
      numberedId,
      todoId,
    ].map(id => doc.getModelById(id));

    convertToDatabase(
      {
        store: doc,
        selection: { clear: () => {} },
        std: {
          command: { exec: () => [null, { selectedModels }] },
          getOptional: () => ({
            setting$: {
              peek: () => ({ taskWorkflowDefaults: {} }),
              get value() {
                return { taskWorkflowDefaults: {} };
              },
            },
          }),
        },
      } as never,
      'table'
    );

    const convertedDatabase = doc
      .getModelById(noteBlockId)
      ?.children.find(
        child =>
          child.flavour === 'affine:database' && child.id !== databaseBlockId
      ) as DatabaseBlockModel | undefined;
    const levelColumn = convertedDatabase?.props.columns.find(
      column => column.name === TASK_HIERARCHY_LEVEL_COLUMN_NAME
    );

    expect(
      convertedDatabase?.children.map(child => child.text?.toString())
    ).toEqual([
      'Plain row',
      'Bullet parent',
      'Bullet child',
      'Numbered row',
      'Todo row',
    ]);
    expect(levelColumn).toBeTruthy();
    expect(
      getCell(convertedDatabase!, paragraphId, levelColumn!.id)?.value
    ).toBe(0);
    expect(
      getCell(convertedDatabase!, bulletParentId, levelColumn!.id)?.value
    ).toBe(0);
    expect(
      getCell(convertedDatabase!, bulletChildId, levelColumn!.id)?.value
    ).toBe(1);
    expect(
      getCell(convertedDatabase!, numberedId, levelColumn!.id)?.value
    ).toBe(0);
    expect(getCell(convertedDatabase!, todoId, levelColumn!.id)?.value).toBe(0);
  });

  test('preserves nested todo preorder when converting list selection to database', () => {
    const addTodo = (text: string, parentId: string) =>
      doc.addBlock(
        'affine:list',
        { type: 'todo', text: new Text(text) },
        parentId
      );

    const parent1 = addTodo('Parent 1', noteBlockId);
    const child11 = addTodo('Child 1.1', parent1);
    const grandchild111 = addTodo('Grandchild 1.1.1', child11);
    const greatGrandchild1111 = addTodo(
      'Great grandchild 1.1.1.1',
      grandchild111
    );
    const grandchild112 = addTodo('Grandchild 1.1.2', child11);
    const child12 = addTodo('Child 1.2', parent1);
    const parent2 = addTodo('Parent 2', noteBlockId);
    const child21 = addTodo('Child 2.1', parent2);
    const child22 = addTodo('Child 2.2', parent2);
    const grandchild221 = addTodo('Grandchild 2.2.1', child22);
    const parent3 = addTodo('Parent 3', noteBlockId);

    const selectedIds = [
      parent1,
      child11,
      grandchild111,
      greatGrandchild1111,
      grandchild112,
      child12,
      parent2,
      child21,
      child22,
      grandchild221,
      parent3,
    ];
    const selectedModels = selectedIds.map(id => doc.getModelById(id));

    convertToDatabase(
      {
        store: doc,
        selection: {
          clear: () => {},
        },
        std: {
          command: {
            exec: () => [null, { selectedModels }],
          },
          getOptional: () => ({
            setting$: {
              peek: () => ({ taskWorkflowDefaults: {} }),
              get value() {
                return { taskWorkflowDefaults: {} };
              },
            },
          }),
        },
      } as never,
      'table'
    );

    const convertedDatabase = doc
      .getModelById(noteBlockId)
      ?.children.find(
        child =>
          child.flavour === 'affine:database' && child.id !== databaseBlockId
      ) as DatabaseBlockModel | undefined;

    expect(
      convertedDatabase?.children.map(child => child.text?.toString())
    ).toEqual([
      'Parent 1',
      'Child 1.1',
      'Grandchild 1.1.1',
      'Great grandchild 1.1.1.1',
      'Grandchild 1.1.2',
      'Child 1.2',
      'Parent 2',
      'Child 2.1',
      'Child 2.2',
      'Grandchild 2.2.1',
      'Parent 3',
    ]);
  });

  test('does not merge global task fields when selected todos have explicit field definitions', () => {
    const todo = doc.addBlock(
      'affine:list',
      {
        type: 'todo',
        text: new Text('Task with local fields'),
        todoFieldDefs: [{ key: 'priority', type: 'text', label: 'Priority' }],
        todoFieldValues: { priority: 'High' },
      },
      noteBlockId
    );
    const selectedModels = [doc.getModelById(todo)];

    convertToDatabase(
      {
        store: doc,
        selection: {
          clear: () => {},
        },
        std: {
          command: {
            exec: () => [null, { selectedModels }],
          },
          getOptional: () => ({
            setting$: {
              peek: () => ({
                taskWorkflowDefaults: {
                  list: {
                    fieldDefs: [
                      { key: 'cost', type: 'number', label: 'Cost' },
                      { key: 'note', type: 'text', label: 'Note' },
                    ],
                  },
                },
              }),
              get value() {
                return {
                  taskWorkflowDefaults: {
                    list: {
                      fieldDefs: [
                        { key: 'cost', type: 'number', label: 'Cost' },
                        { key: 'note', type: 'text', label: 'Note' },
                      ],
                    },
                  },
                };
              },
            },
          }),
        },
      } as never,
      'table'
    );

    const convertedDatabase = doc
      .getModelById(noteBlockId)
      ?.children.find(
        child =>
          child.flavour === 'affine:database' && child.id !== databaseBlockId
      ) as DatabaseBlockModel | undefined;

    expect(
      convertedDatabase?.props.columns.map(column => column.name)
    ).toContain('Priority');
    expect(
      convertedDatabase?.props.columns.map(column => column.name)
    ).not.toContain('Cost');
    expect(
      convertedDatabase?.props.columns.map(column => column.name)
    ).not.toContain('Note');
  });

  test('preserves default fields for todos without explicit fields in mixed conversion', () => {
    const explicitTodo = doc.addBlock(
      'affine:list',
      {
        type: 'todo',
        text: new Text('Explicit task'),
        todoFieldDefs: [{ key: 'priority', type: 'text', label: 'Priority' }],
        todoFieldValues: { priority: 'High' },
      },
      noteBlockId
    );
    const defaultTodo = doc.addBlock(
      'affine:list',
      {
        type: 'todo',
        text: new Text('Default task'),
        todoFieldValues: { cost: 3 },
      },
      noteBlockId
    );
    const selectedModels = [
      doc.getModelById(explicitTodo),
      doc.getModelById(defaultTodo),
    ];

    convertToDatabase(
      {
        store: doc,
        selection: { clear: () => {} },
        std: {
          command: { exec: () => [null, { selectedModels }] },
          getOptional: () => ({
            setting$: {
              peek: () => ({
                taskWorkflowDefaults: {
                  list: {
                    fieldDefs: [{ key: 'cost', type: 'number', label: 'Cost' }],
                  },
                },
              }),
              get value() {
                return {
                  taskWorkflowDefaults: {
                    list: {
                      fieldDefs: [
                        { key: 'cost', type: 'number', label: 'Cost' },
                      ],
                    },
                  },
                };
              },
            },
          }),
        },
      } as never,
      'table'
    );

    const convertedDatabase = doc
      .getModelById(noteBlockId)
      ?.children.find(
        child =>
          child.flavour === 'affine:database' && child.id !== databaseBlockId
      ) as DatabaseBlockModel | undefined;

    expect(convertedDatabase?.props.columns.map(column => column.name)).toEqual(
      expect.arrayContaining(['Priority', 'Cost'])
    );
  });

  test('preserves inherited todo field config for child-only conversion', () => {
    const parent = doc.addBlock(
      'affine:list',
      {
        type: 'todo',
        text: new Text('Parent task'),
        todoFieldDefs: [{ key: 'owner', type: 'select', label: 'Owner' }],
        todoDatabaseStatusMapping: {
          statusColumnName: 'State',
          doneTagLabel: 'Finished',
        },
      },
      noteBlockId
    );
    const child = doc.addBlock(
      'affine:list',
      {
        type: 'todo',
        text: new Text('Child task'),
        todoFieldValues: { owner: 'Ada' },
      },
      parent
    );
    const selectedModels = [doc.getModelById(child)];

    convertToDatabase(
      {
        store: doc,
        selection: { clear: () => {} },
        std: {
          command: { exec: () => [null, { selectedModels }] },
          getOptional: () => ({
            setting$: {
              peek: () => ({ taskWorkflowDefaults: {} }),
              get value() {
                return { taskWorkflowDefaults: {} };
              },
            },
          }),
        },
      } as never,
      'table'
    );

    const convertedDatabase = doc
      .getModelById(noteBlockId)
      ?.children.find(
        model =>
          model.flavour === 'affine:database' && model.id !== databaseBlockId
      ) as DatabaseBlockModel | undefined;

    expect(convertedDatabase?.props.columns.map(column => column.name)).toEqual(
      expect.arrayContaining(['State', 'Owner'])
    );
    expect(
      convertedDatabase?.props.columns.find(column => column.name === 'State')
        ?.data.options ?? []
    ).toContainEqual(expect.objectContaining({ value: 'Finished' }));
  });

  test('converts expanded todo optional field types to database columns', () => {
    const todo = doc.addBlock(
      'affine:list',
      {
        type: 'todo',
        text: new Text('Task with typed fields'),
        todoFieldDefs: [
          { key: 'owner', type: 'select', label: 'Owner' },
          { key: 'tags', type: 'multi_select', label: 'Tags' },
          { key: 'done', type: 'progress', label: 'Done' },
          { key: 'due', type: 'date', label: 'Due' },
        ],
        todoFieldValues: {
          owner: 'Ada',
          tags: 'Backend, Urgent',
          done: 75,
          due: '2026-06-05',
        },
      },
      noteBlockId
    );
    const selectedModels = [doc.getModelById(todo)];

    convertToDatabase(
      {
        store: doc,
        selection: {
          clear: () => {},
        },
        std: {
          command: {
            exec: () => [null, { selectedModels }],
          },
          getOptional: () => ({
            setting$: {
              peek: () => ({ taskWorkflowDefaults: {} }),
              get value() {
                return { taskWorkflowDefaults: {} };
              },
            },
          }),
        },
      } as never,
      'table'
    );

    const convertedDatabase = doc
      .getModelById(noteBlockId)
      ?.children.find(
        child =>
          child.flavour === 'affine:database' && child.id !== databaseBlockId
      ) as DatabaseBlockModel | undefined;
    const columns = convertedDatabase?.props.columns ?? [];
    const ownerColumn = columns.find(column => column.name === 'Owner');
    const tagsColumn = columns.find(column => column.name === 'Tags');
    const progressColumn = columns.find(column => column.name === 'Done');
    const dueColumn = columns.find(column => column.name === 'Due');

    expect(ownerColumn?.type).toBe('select');
    expect(tagsColumn?.type).toBe('multi-select');
    expect(progressColumn?.type).toBe('progress');
    expect(dueColumn?.type).toBe('date');
    const ownerOptions = ownerColumn?.data.options as
      | { id: string }[]
      | undefined;
    const tagsOptions = tagsColumn?.data.options as
      | { id: string }[]
      | undefined;
    expect(getCell(convertedDatabase!, todo, ownerColumn!.id)?.value).toEqual(
      ownerOptions?.[0]?.id
    );
    expect(getCell(convertedDatabase!, todo, tagsColumn!.id)?.value).toEqual(
      tagsOptions?.map(option => option.id)
    );
    expect(getCell(convertedDatabase!, todo, progressColumn!.id)?.value).toBe(
      75
    );
    expect(typeof getCell(convertedDatabase!, todo, dueColumn!.id)?.value).toBe(
      'number'
    );
  });

  test('skips invalid number and progress todo values during conversion', () => {
    const todo = doc.addBlock(
      'affine:list',
      {
        type: 'todo',
        text: new Text('Invalid typed fields'),
        todoFieldDefs: [
          { key: 'cost', type: 'number', label: 'Cost' },
          { key: 'done', type: 'progress', label: 'Done' },
        ],
        todoFieldValues: { cost: 'Infinity', done: 999 },
      },
      noteBlockId
    );
    const selectedModels = [doc.getModelById(todo)];

    convertToDatabase(
      {
        store: doc,
        selection: { clear: () => {} },
        std: {
          command: { exec: () => [null, { selectedModels }] },
          getOptional: () => ({
            setting$: {
              peek: () => ({ taskWorkflowDefaults: {} }),
              get value() {
                return { taskWorkflowDefaults: {} };
              },
            },
          }),
        },
      } as never,
      'table'
    );

    const convertedDatabase = doc
      .getModelById(noteBlockId)
      ?.children.find(
        model =>
          model.flavour === 'affine:database' && model.id !== databaseBlockId
      ) as DatabaseBlockModel | undefined;
    const costColumn = convertedDatabase?.props.columns.find(
      column => column.name === 'Cost'
    );
    const doneColumn = convertedDatabase?.props.columns.find(
      column => column.name === 'Done'
    );

    expect(getCell(convertedDatabase!, todo, costColumn!.id)).toBeFalsy();
    expect(getCell(convertedDatabase!, todo, doneColumn!.id)).toBeFalsy();
  });

  test('recomputes parent status from children in status select column', () => {
    const statusColumnId = addProperty(
      db,
      'end',
      propertyModelPresets.selectPropertyModelConfig.create('Status', {
        options: selection,
      })
    );
    const parentIdentityColumnId = addProperty(
      db,
      'end',
      databaseBlockProperties.richTextColumnConfig.create(
        TASK_PARENT_IDENTIFIER_COLUMN_NAME
      )
    );

    const parentRow = doc.addBlock(
      'affine:paragraph',
      { text: new Text('parent') },
      databaseBlockId
    );
    const childA = doc.addBlock(
      'affine:paragraph',
      { text: new Text('child-a') },
      databaseBlockId
    );
    const childB = doc.addBlock(
      'affine:paragraph',
      { text: new Text('child-b') },
      databaseBlockId
    );

    const parentIdentity = createTaskIdentity({
      docId: doc.id,
      blockId: parentRow,
    });
    updateCell(db, childA, {
      columnId: parentIdentityColumnId,
      value: new Text(parentIdentity),
    });
    updateCell(db, childB, {
      columnId: parentIdentityColumnId,
      value: new Text(parentIdentity),
    });

    const dataSource = new DatabaseBlockDataSource(db);
    dataSource.cellValueChange(childA, statusColumnId, selection[2]?.id);
    expect(getCell(db, parentRow, statusColumnId)?.value).toEqual(
      selection[2]?.id
    );

    dataSource.cellValueChange(childA, statusColumnId, selection[0]?.id);
    dataSource.cellValueChange(childB, statusColumnId, selection[0]?.id);
    expect(getCell(db, parentRow, statusColumnId)?.value).toEqual(
      selection[0]?.id
    );
  });

  test('a parent auto-promoted to done via cascade gets its own "Done date" stamped too (not just the manually-checked child)', () => {
    const statusColumnId = addProperty(
      db,
      'end',
      propertyModelPresets.selectPropertyModelConfig.create('Status', {
        options: selection,
      })
    );
    const parentIdentityColumnId = addProperty(
      db,
      'end',
      databaseBlockProperties.richTextColumnConfig.create(
        TASK_PARENT_IDENTIFIER_COLUMN_NAME
      )
    );

    const parentRow = doc.addBlock(
      'affine:paragraph',
      { text: new Text('parent') },
      databaseBlockId
    );
    const child = doc.addBlock(
      'affine:paragraph',
      { text: new Text('child') },
      databaseBlockId
    );
    updateCell(db, child, {
      columnId: parentIdentityColumnId,
      value: new Text(
        createTaskIdentity({ docId: doc.id, blockId: parentRow })
      ),
    });

    const dataSource = new DatabaseBlockDataSource(db);
    dataSource.cellValueChange(child, statusColumnId, selection[0]?.id); // "Done"
    expect(getCell(db, parentRow, statusColumnId)?.value).toEqual(
      selection[0]?.id
    );

    // The parent was never directly checked by a caller — its own Status
    // cell was flipped entirely by the cascade in `recomputeParentStatusesFromChildren`
    // (a different write path than `setTaskStatusChecked`/the primary
    // row's own stamp in `cellValueChange`) — its Done date must still be
    // stamped, or it would immediately fail a live filter like the
    // Journal Todo view's own `OR(isNotOneOf(done), after(doneDate, ...))`
    // and vanish, despite never having been explicitly marked done in
    // that view.
    const doneDateColumnId = dataSource.ensureDoneDateColumn()!;
    expect(typeof getCell(db, parentRow, doneDateColumnId)?.value).toBe(
      'number'
    );

    dataSource.cellValueChange(child, statusColumnId, selection[1]?.id); // back to "TODO"
    expect(getCell(db, parentRow, statusColumnId)?.value).toEqual(
      selection[1]?.id
    );
    expect(getCell(db, parentRow, doneDateColumnId)?.value ?? null).toBeNull();
  });

  test('Story 2.6: ensureNoteColumn/ensureNoteColorColumn are idempotent, both are hidden everywhere (the user-facing affordance is a row-level hover button, not a column), and neither is directly editable', () => {
    const dataSource = new DatabaseBlockDataSource(db);

    const noteColumnId = dataSource.ensureNoteColumn();
    const noteColumnIdAgain = dataSource.ensureNoteColumn();
    expect(noteColumnId).toBeTruthy();
    expect(noteColumnIdAgain).toBe(noteColumnId);

    const noteColorColumnId = dataSource.ensureNoteColorColumn();
    const noteColorColumnIdAgain = dataSource.ensureNoteColorColumn();
    expect(noteColorColumnId).toBeTruthy();
    expect(noteColorColumnIdAgain).toBe(noteColorColumnId);

    // A freshly added view (any mode, including table) hides both Note
    // and Note color — pure plumbing, never a user-visible column.
    const listViewId = dataSource.viewManager.viewAdd('list');
    const listView = dataSource.viewDataGet(listViewId) as unknown as {
      columns?: { id: string; hide?: boolean }[];
    };
    expect(listView.columns?.find(c => c.id === noteColorColumnId)?.hide).toBe(
      true
    );
    expect(listView.columns?.find(c => c.id === noteColumnId)?.hide).toBe(true);

    // Neither column can be directly edited as a raw cell value — both are
    // auto-managed system columns (`READONLY_SYSTEM_COLUMN_NAMES`).
    expect(dataSource.propertyReadonlyGet(noteColumnId!)).toBe(true);
    expect(dataSource.propertyReadonlyGet(noteColorColumnId!)).toBe(true);
  });

  test('recomputes parent status for custom status column name and done label', () => {
    const customOptions = [
      { id: 'todo', value: 'Open', color: 'var(--affine-tag-yellow)' },
      { id: 'done', value: 'Finished', color: 'var(--affine-tag-green)' },
    ];
    const statusColumnId = addProperty(
      db,
      'end',
      propertyModelPresets.selectPropertyModelConfig.create('State', {
        options: customOptions,
      })
    );
    const parentIdentityColumnId = addProperty(
      db,
      'end',
      databaseBlockProperties.richTextColumnConfig.create(
        TASK_PARENT_IDENTIFIER_COLUMN_NAME
      )
    );

    const parent = doc.addBlock(
      'affine:paragraph',
      { text: new Text('parent') },
      databaseBlockId
    );
    const child = doc.addBlock(
      'affine:paragraph',
      { text: new Text('child') },
      databaseBlockId
    );
    updateCell(db, child, {
      columnId: parentIdentityColumnId,
      value: new Text(createTaskIdentity({ docId: doc.id, blockId: parent })),
    });

    const dataSource = new DatabaseBlockDataSource(db);
    dataSource.cellValueChange(child, statusColumnId, 'done');
    expect(getCell(db, parent, statusColumnId)?.value).toEqual('done');
  });

  test('treats custom not-done option as todo for parent status recompute', () => {
    const customOptions = [
      { id: 'not_done', value: 'Open', color: 'var(--affine-tag-yellow)' },
      { id: 'done', value: 'Finished', color: 'var(--affine-tag-green)' },
    ];
    const statusColumnId = addProperty(
      db,
      'end',
      propertyModelPresets.selectPropertyModelConfig.create('Status', {
        options: customOptions,
      })
    );
    const parentIdentityColumnId = addProperty(
      db,
      'end',
      databaseBlockProperties.richTextColumnConfig.create(
        TASK_PARENT_IDENTIFIER_COLUMN_NAME
      )
    );
    const parent = doc.addBlock(
      'affine:paragraph',
      { text: new Text('parent') },
      databaseBlockId
    );
    const child = doc.addBlock(
      'affine:paragraph',
      { text: new Text('child') },
      databaseBlockId
    );
    updateCell(db, child, {
      columnId: parentIdentityColumnId,
      value: new Text(createTaskIdentity({ docId: doc.id, blockId: parent })),
    });

    const dataSource = new DatabaseBlockDataSource(db);
    dataSource.cellValueChange(child, statusColumnId, 'not_done');

    expect(getCell(db, parent, statusColumnId)?.value).toEqual('not_done');
  });

  test('does not recompute parent status when inheritance is disabled', () => {
    const statusColumnId = addProperty(
      db,
      'end',
      propertyModelPresets.selectPropertyModelConfig.create('Status', {
        options: selection,
      })
    );
    const parentIdentityColumnId = addProperty(
      db,
      'end',
      databaseBlockProperties.richTextColumnConfig.create(
        TASK_PARENT_IDENTIFIER_COLUMN_NAME
      )
    );
    const parent = doc.addBlock(
      'affine:paragraph',
      { text: new Text('parent') },
      databaseBlockId
    );
    const child = doc.addBlock(
      'affine:paragraph',
      { text: new Text('child') },
      databaseBlockId
    );
    updateCell(db, child, {
      columnId: parentIdentityColumnId,
      value: new Text(createTaskIdentity({ docId: doc.id, blockId: parent })),
    });

    const dataSource = new DatabaseBlockDataSource(db);
    dataSource.setTaskStatusInheritance({
      done: 'disabled',
      inProgress: 'disabled',
    });
    dataSource.cellValueChange(child, statusColumnId, selection[0]?.id);

    expect(getCell(db, parent, statusColumnId)?.value).toBeUndefined();
  });

  test('recomputes existing parent statuses when inheritance settings change', () => {
    const statusColumnId = addProperty(
      db,
      'end',
      propertyModelPresets.selectPropertyModelConfig.create('Status', {
        options: selection,
      })
    );
    const parentIdentityColumnId = addProperty(
      db,
      'end',
      databaseBlockProperties.richTextColumnConfig.create(
        TASK_PARENT_IDENTIFIER_COLUMN_NAME
      )
    );
    const parent = doc.addBlock(
      'affine:paragraph',
      { text: new Text('parent') },
      databaseBlockId
    );
    const child = doc.addBlock(
      'affine:paragraph',
      { text: new Text('child') },
      databaseBlockId
    );
    updateCell(db, child, {
      columnId: parentIdentityColumnId,
      value: new Text(createTaskIdentity({ docId: doc.id, blockId: parent })),
    });

    const dataSource = new DatabaseBlockDataSource(db);
    dataSource.setTaskStatusInheritance({
      done: 'disabled',
      inProgress: 'disabled',
    });
    dataSource.cellValueChange(child, statusColumnId, selection[0]?.id);
    expect(getCell(db, parent, statusColumnId)?.value).toBeUndefined();

    dataSource.setTaskStatusInheritance({
      done: 'require-all-subtasks-complete',
    });

    expect(getCell(db, parent, statusColumnId)?.value).toEqual(
      selection[0]?.id
    );
  });

  test('manual parent done cascades to descendants by default and can be disabled', () => {
    const statusColumnId = addProperty(
      db,
      'end',
      propertyModelPresets.selectPropertyModelConfig.create('Status', {
        options: selection,
      })
    );
    const parentIdentityColumnId = addProperty(
      db,
      'end',
      databaseBlockProperties.richTextColumnConfig.create(
        TASK_PARENT_IDENTIFIER_COLUMN_NAME
      )
    );

    const parent = doc.addBlock(
      'affine:paragraph',
      { text: new Text('parent') },
      databaseBlockId
    );
    const child = doc.addBlock(
      'affine:paragraph',
      { text: new Text('child') },
      databaseBlockId
    );
    const grandchild = doc.addBlock(
      'affine:paragraph',
      { text: new Text('grandchild') },
      databaseBlockId
    );
    updateCell(db, child, {
      columnId: parentIdentityColumnId,
      value: new Text(createTaskIdentity({ docId: doc.id, blockId: parent })),
    });
    updateCell(db, grandchild, {
      columnId: parentIdentityColumnId,
      value: new Text(createTaskIdentity({ docId: doc.id, blockId: child })),
    });

    const dataSource = new DatabaseBlockDataSource(db);
    dataSource.cellValueChange(parent, statusColumnId, selection[0]?.id);
    expect(getCell(db, child, statusColumnId)?.value).toEqual(selection[0]?.id);
    expect(getCell(db, grandchild, statusColumnId)?.value).toEqual(
      selection[0]?.id
    );

    dataSource.cellValueChange(parent, statusColumnId, selection[1]?.id);
    dataSource.setTaskStatusInheritance({
      cascadeManualDoneToDescendants: false,
    });
    dataSource.cellValueChange(parent, statusColumnId, selection[0]?.id);
    expect(getCell(db, child, statusColumnId)?.value).toEqual(selection[1]?.id);
    expect(getCell(db, grandchild, statusColumnId)?.value).toEqual(
      selection[1]?.id
    );
  });

  test('parent todo cascade preserves manually locked done descendants', () => {
    const statusColumnId = addProperty(
      db,
      'end',
      propertyModelPresets.selectPropertyModelConfig.create('Status', {
        options: selection,
      })
    );
    const parentIdentityColumnId = addProperty(
      db,
      'end',
      databaseBlockProperties.richTextColumnConfig.create(
        TASK_PARENT_IDENTIFIER_COLUMN_NAME
      )
    );

    const parent = doc.addBlock(
      'affine:paragraph',
      { text: new Text('parent') },
      databaseBlockId
    );
    const child = doc.addBlock(
      'affine:paragraph',
      { text: new Text('child') },
      databaseBlockId
    );
    const grandchild = doc.addBlock(
      'affine:paragraph',
      { text: new Text('grandchild') },
      databaseBlockId
    );
    updateCell(db, child, {
      columnId: parentIdentityColumnId,
      value: new Text(createTaskIdentity({ docId: doc.id, blockId: parent })),
    });
    updateCell(db, grandchild, {
      columnId: parentIdentityColumnId,
      value: new Text(createTaskIdentity({ docId: doc.id, blockId: child })),
    });
    updateCell(db, grandchild, {
      columnId: statusColumnId,
      value: selection[0]?.id,
    });
    db.props.taskStatusState = {
      [grandchild]: {
        provenance: 'manual',
        manualLock: 'done_locked',
      },
    };

    const dataSource = new DatabaseBlockDataSource(db);
    dataSource.cellValueChange(parent, statusColumnId, selection[1]?.id);

    expect(getCell(db, child, statusColumnId)?.value).toEqual(selection[1]?.id);
    expect(getCell(db, grandchild, statusColumnId)?.value).toEqual(
      selection[0]?.id
    );
  });

  test('promotes ancestors from descendant done and cascades todo without overwriting manual done descendants', () => {
    const statusColumnId = addProperty(
      db,
      'end',
      propertyModelPresets.selectPropertyModelConfig.create('Status', {
        options: selection,
      })
    );
    const parentIdentityColumnId = addProperty(
      db,
      'end',
      databaseBlockProperties.richTextColumnConfig.create(
        TASK_PARENT_IDENTIFIER_COLUMN_NAME
      )
    );

    const parent = doc.addBlock(
      'affine:paragraph',
      { text: new Text('p') },
      databaseBlockId
    );
    const child = doc.addBlock(
      'affine:paragraph',
      { text: new Text('c') },
      databaseBlockId
    );
    const grandchild = doc.addBlock(
      'affine:paragraph',
      { text: new Text('g') },
      databaseBlockId
    );

    const parentIdentity = createTaskIdentity({
      docId: doc.id,
      blockId: parent,
    });
    const childIdentity = createTaskIdentity({ docId: doc.id, blockId: child });
    updateCell(db, child, {
      columnId: parentIdentityColumnId,
      value: new Text(parentIdentity),
    });
    updateCell(db, grandchild, {
      columnId: parentIdentityColumnId,
      value: new Text(childIdentity),
    });

    const dataSource = new DatabaseBlockDataSource(db);
    dataSource.cellValueChange(grandchild, statusColumnId, selection[0]?.id);
    expect(getCell(db, child, statusColumnId)?.value).toEqual(selection[0]?.id);
    expect(getCell(db, parent, statusColumnId)?.value).toEqual(
      selection[0]?.id
    );

    dataSource.cellValueChange(parent, statusColumnId, selection[1]?.id);
    expect(getCell(db, child, statusColumnId)?.value).toEqual(selection[1]?.id);
    expect(getCell(db, grandchild, statusColumnId)?.value).toEqual(
      selection[0]?.id
    );
  });

  test('demotes auto ancestor when any descendant demotes from done', () => {
    const statusColumnId = addProperty(
      db,
      'end',
      propertyModelPresets.selectPropertyModelConfig.create('Status', {
        options: selection,
      })
    );
    const parentIdentityColumnId = addProperty(
      db,
      'end',
      databaseBlockProperties.richTextColumnConfig.create(
        TASK_PARENT_IDENTIFIER_COLUMN_NAME
      )
    );

    const root = doc.addBlock(
      'affine:paragraph',
      { text: new Text('r') },
      databaseBlockId
    );
    const mid = doc.addBlock(
      'affine:paragraph',
      { text: new Text('m') },
      databaseBlockId
    );
    const leaf = doc.addBlock(
      'affine:paragraph',
      { text: new Text('l') },
      databaseBlockId
    );

    const rootIdentity = createTaskIdentity({ docId: doc.id, blockId: root });
    const midIdentity = createTaskIdentity({ docId: doc.id, blockId: mid });
    updateCell(db, mid, {
      columnId: parentIdentityColumnId,
      value: new Text(rootIdentity),
    });
    updateCell(db, leaf, {
      columnId: parentIdentityColumnId,
      value: new Text(midIdentity),
    });

    const dataSource = new DatabaseBlockDataSource(db);
    dataSource.cellValueChange(leaf, statusColumnId, selection[0]?.id);

    expect(getCell(db, root, statusColumnId)?.value).toEqual(selection[0]?.id);

    dataSource.cellValueChange(leaf, statusColumnId, selection[2]?.id);
    expect(getCell(db, root, statusColumnId)?.value).toEqual(selection[2]?.id);
  });

  test('demotes all auto done ancestors when a grandchild demotes to in-progress semantic', () => {
    const options = [
      {
        id: 'todo',
        value: 'Todo',
        color: 'var(--affine-tag-yellow)',
        semantic: 'todo' as const,
      },
      {
        id: 'in_progress',
        value: 'In Progress',
        color: 'var(--affine-tag-blue)',
        semantic: 'in_progress' as const,
      },
      {
        id: 'workflow_review',
        value: 'Review',
        color: 'var(--affine-tag-blue)',
        semantic: 'in_progress' as const,
      },
      {
        id: 'done',
        value: 'Done',
        color: 'var(--affine-tag-green)',
        semantic: 'done' as const,
      },
    ];
    const statusColumnId = addProperty(
      db,
      'end',
      propertyModelPresets.selectPropertyModelConfig.create('Status', {
        options,
      })
    );
    const parentIdentityColumnId = addProperty(
      db,
      'end',
      databaseBlockProperties.richTextColumnConfig.create(
        TASK_PARENT_IDENTIFIER_COLUMN_NAME
      )
    );

    const root = doc.addBlock(
      'affine:paragraph',
      { text: new Text('r') },
      databaseBlockId
    );
    const mid = doc.addBlock(
      'affine:paragraph',
      { text: new Text('m') },
      databaseBlockId
    );
    const leaf = doc.addBlock(
      'affine:paragraph',
      { text: new Text('l') },
      databaseBlockId
    );

    updateCell(db, mid, {
      columnId: parentIdentityColumnId,
      value: new Text(createTaskIdentity({ docId: doc.id, blockId: root })),
    });
    updateCell(db, leaf, {
      columnId: parentIdentityColumnId,
      value: new Text(createTaskIdentity({ docId: doc.id, blockId: mid })),
    });

    const dataSource = new DatabaseBlockDataSource(db);
    dataSource.cellValueChange(leaf, statusColumnId, [{ id: 'done' }]);
    expect(getCell(db, mid, statusColumnId)?.value).toEqual('done');
    expect(getCell(db, root, statusColumnId)?.value).toEqual('done');

    dataSource.cellValueChange(leaf, statusColumnId, [
      { id: 'workflow_review' },
    ]);
    expect(getCell(db, mid, statusColumnId)?.value).toEqual('in_progress');
    expect(getCell(db, root, statusColumnId)?.value).toEqual('in_progress');
  });

  test('demotes done ancestors without provenance unless explicitly manually locked', () => {
    const statusColumnId = addProperty(
      db,
      'end',
      propertyModelPresets.selectPropertyModelConfig.create('Status', {
        options: selection,
      })
    );
    const parentIdentityColumnId = addProperty(
      db,
      'end',
      databaseBlockProperties.richTextColumnConfig.create(
        TASK_PARENT_IDENTIFIER_COLUMN_NAME
      )
    );

    const parent = doc.addBlock(
      'affine:paragraph',
      { text: new Text('parent') },
      databaseBlockId
    );
    const child = doc.addBlock(
      'affine:paragraph',
      { text: new Text('child') },
      databaseBlockId
    );
    updateCell(db, child, {
      columnId: parentIdentityColumnId,
      value: new Text(createTaskIdentity({ docId: doc.id, blockId: parent })),
    });
    updateCell(db, parent, {
      columnId: statusColumnId,
      value: selection[0]?.id,
    });

    const dataSource = new DatabaseBlockDataSource(db);
    dataSource.cellValueChange(child, statusColumnId, selection[2]?.id);

    expect(getCell(db, parent, statusColumnId)?.value).toEqual(
      selection[2]?.id
    );
  });

  test('demotes an already-done ancestor after children make it auto-satisfied', () => {
    const statusColumnId = addProperty(
      db,
      'end',
      propertyModelPresets.selectPropertyModelConfig.create('Status', {
        options: selection,
      })
    );
    const parentIdentityColumnId = addProperty(
      db,
      'end',
      databaseBlockProperties.richTextColumnConfig.create(
        TASK_PARENT_IDENTIFIER_COLUMN_NAME
      )
    );

    const parent = doc.addBlock(
      'affine:paragraph',
      { text: new Text('parent') },
      databaseBlockId
    );
    const child = doc.addBlock(
      'affine:paragraph',
      { text: new Text('child') },
      databaseBlockId
    );
    updateCell(db, child, {
      columnId: parentIdentityColumnId,
      value: new Text(createTaskIdentity({ docId: doc.id, blockId: parent })),
    });

    const dataSource = new DatabaseBlockDataSource(db);
    dataSource.cellValueChange(parent, statusColumnId, selection[0]?.id);
    dataSource.cellValueChange(child, statusColumnId, selection[0]?.id);
    dataSource.cellValueChange(child, statusColumnId, selection[2]?.id);

    expect(getCell(db, parent, statusColumnId)?.value).toEqual(
      selection[2]?.id
    );
  });

  test('demotes an auto-done ancestor when a nested branch child demotes', () => {
    const statusColumnId = addProperty(
      db,
      'end',
      propertyModelPresets.selectPropertyModelConfig.create('Status', {
        options: selection,
      })
    );
    const parentIdentityColumnId = addProperty(
      db,
      'end',
      databaseBlockProperties.richTextColumnConfig.create(
        TASK_PARENT_IDENTIFIER_COLUMN_NAME
      )
    );

    const root = doc.addBlock(
      'affine:paragraph',
      { text: new Text('root') },
      databaseBlockId
    );
    const branch = doc.addBlock(
      'affine:paragraph',
      { text: new Text('branch') },
      databaseBlockId
    );
    const sibling = doc.addBlock(
      'affine:paragraph',
      { text: new Text('sibling') },
      databaseBlockId
    );
    const leaf = doc.addBlock(
      'affine:paragraph',
      { text: new Text('leaf') },
      databaseBlockId
    );

    updateCell(db, branch, {
      columnId: parentIdentityColumnId,
      value: new Text(createTaskIdentity({ docId: doc.id, blockId: root })),
    });
    updateCell(db, sibling, {
      columnId: parentIdentityColumnId,
      value: new Text(createTaskIdentity({ docId: doc.id, blockId: root })),
    });
    updateCell(db, leaf, {
      columnId: parentIdentityColumnId,
      value: new Text(createTaskIdentity({ docId: doc.id, blockId: branch })),
    });

    const dataSource = new DatabaseBlockDataSource(db);
    dataSource.cellValueChange(leaf, statusColumnId, selection[0]?.id);
    dataSource.cellValueChange(sibling, statusColumnId, selection[0]?.id);
    expect(getCell(db, branch, statusColumnId)?.value).toEqual(
      selection[0]?.id
    );
    expect(getCell(db, root, statusColumnId)?.value).toEqual(selection[0]?.id);

    dataSource.cellValueChange(leaf, statusColumnId, selection[2]?.id);

    expect(getCell(db, branch, statusColumnId)?.value).toEqual(
      selection[2]?.id
    );
    expect(getCell(db, root, statusColumnId)?.value).toEqual(selection[2]?.id);
  });

  test('demotes auto ancestors when select values are option objects', () => {
    const statusColumnId = addProperty(
      db,
      'end',
      propertyModelPresets.selectPropertyModelConfig.create('Status', {
        options: selection,
      })
    );
    const parentIdentityColumnId = addProperty(
      db,
      'end',
      databaseBlockProperties.richTextColumnConfig.create(
        TASK_PARENT_IDENTIFIER_COLUMN_NAME
      )
    );
    const parent = doc.addBlock(
      'affine:paragraph',
      { text: new Text('parent') },
      databaseBlockId
    );
    const child = doc.addBlock(
      'affine:paragraph',
      { text: new Text('child') },
      databaseBlockId
    );
    updateCell(db, child, {
      columnId: parentIdentityColumnId,
      value: new Text(createTaskIdentity({ docId: doc.id, blockId: parent })),
    });

    const dataSource = new DatabaseBlockDataSource(db);
    dataSource.cellValueChange(child, statusColumnId, selection[0]);
    expect(getCell(db, parent, statusColumnId)?.value).toEqual(
      selection[0]?.id
    );

    dataSource.cellValueChange(child, statusColumnId, selection[2]);
    expect(getCell(db, parent, statusColumnId)?.value).toEqual(
      selection[2]?.id
    );
  });

  test('demotes A while preserving manually done intermediates in A>B>C>D', () => {
    const statusColumnId = addProperty(
      db,
      'end',
      propertyModelPresets.selectPropertyModelConfig.create('Status', {
        options: selection,
      })
    );
    const parentIdentityColumnId = addProperty(
      db,
      'end',
      databaseBlockProperties.richTextColumnConfig.create(
        TASK_PARENT_IDENTIFIER_COLUMN_NAME
      )
    );

    const a = doc.addBlock(
      'affine:paragraph',
      { text: new Text('A') },
      databaseBlockId
    );
    const b = doc.addBlock(
      'affine:paragraph',
      { text: new Text('B') },
      databaseBlockId
    );
    const c = doc.addBlock(
      'affine:paragraph',
      { text: new Text('C') },
      databaseBlockId
    );
    const d = doc.addBlock(
      'affine:paragraph',
      { text: new Text('D') },
      databaseBlockId
    );

    updateCell(db, b, {
      columnId: parentIdentityColumnId,
      value: new Text(createTaskIdentity({ docId: doc.id, blockId: a })),
    });
    updateCell(db, c, {
      columnId: parentIdentityColumnId,
      value: new Text(createTaskIdentity({ docId: doc.id, blockId: b })),
    });
    updateCell(db, d, {
      columnId: parentIdentityColumnId,
      value: new Text(createTaskIdentity({ docId: doc.id, blockId: c })),
    });
    updateCell(db, c, { columnId: statusColumnId, value: selection[0]?.id });
    updateCell(db, d, { columnId: statusColumnId, value: selection[0]?.id });
    db.props.taskStatusState = {
      [c]: { provenance: 'manual', manualLock: 'done_locked' },
      [d]: { provenance: 'manual', manualLock: 'done_locked' },
    };

    const dataSource = new DatabaseBlockDataSource(db);
    dataSource.cellValueChange(b, statusColumnId, selection[0]?.id);
    expect(getCell(db, a, statusColumnId)?.value).toEqual(selection[0]?.id);

    dataSource.cellValueChange(d, statusColumnId, selection[2]?.id);
    expect(getCell(db, c, statusColumnId)?.value).toEqual(selection[0]?.id);
    expect(getCell(db, b, statusColumnId)?.value).toEqual(selection[0]?.id);
    expect(getCell(db, a, statusColumnId)?.value).toEqual(selection[2]?.id);
  });

  test('converting a table view to Kanban when no groupable column exists yet auto-creates one instead of throwing', async () => {
    // Regression (reported live, 2026-07-27): `viewChangeType` runs inside
    // `updateView`'s own `model.store.transact(...)`. Kanban's `defaultData`
    // (`kanban/define.ts`) auto-creates a fallback "Status" column via
    // `propertyAdd` when no groupable column exists yet — but `propertyAdd`
    // does its *own*, nested `store.transact(...)`, and immediately reading
    // that fresh column back (`propertyTypeGet`, to build the `groupBy`)
    // went through `getNormalPropertyAndIndex`'s `this._model.props
    // .columns$.value` — a signal that doesn't refresh until the
    // *outermost* transaction closes, so it couldn't see a column written
    // inside a still-open nested one. `defaultData` threw "no groupable
    // column found" mid-transaction, corrupting the view conversion. This
    // reproduces with a plain, never-referenced database — nothing to do
    // with `database-ref`, despite surfacing there too (any code path that
    // calls `viewGet`/re-renders a Kanban view hits it).
    const { viewPresets } = await import('@blocksuite/data-view/view-presets');
    const datasource = new DatabaseBlockDataSource(db);
    databaseViewInitTemplate(datasource, 'table');

    const currentViewId = datasource.viewManager.currentViewId$.value;
    expect(currentViewId).toBeTruthy();

    expect(() =>
      datasource.viewManager.viewChangeType(
        currentViewId!,
        viewPresets.kanbanViewMeta.type
      )
    ).not.toThrow();

    const view = datasource.viewManager.viewDataGet(currentViewId!);
    expect(view?.mode).toBe(viewPresets.kanbanViewMeta.type);

    // A fallback "Status" select column must actually have been created
    // and be resolvable immediately (not just physically present in the
    // Yjs doc but invisible to the reactive layer).
    const statusColumn = db.props.columns.find(c => c.name === 'Status');
    expect(statusColumn).toBeTruthy();
    expect(datasource.propertyTypeGet(statusColumn!.id)).toBe('select');
  });
});
