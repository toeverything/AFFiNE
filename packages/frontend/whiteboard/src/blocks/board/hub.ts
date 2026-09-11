import { I18n } from '@affine/i18n';
import { DatabaseBlockDataSource } from '@blocksuite/affine/blocks/database';
import {
  type DatabaseBlockModel,
  NoteDisplayMode,
} from '@blocksuite/affine/model';
import { nanoid, type Store, Text } from '@blocksuite/affine/store';

import {
  type BoardColumnSeed,
  type BoardStatusOption,
  type BoardTemplate,
  columnsForTemplate,
} from './types';

export const BOARD_HUB_NOTE_FLAG = 'wb-board-data-hub';

export type CreatedBoardDatabase = {
  noteId: string;
  databaseId: string;
  viewId?: string;
};

type SelectOption = {
  id: string;
  value: string;
  color: string;
};

function localizeColumnName(name: string): string {
  switch (name) {
    case 'Status':
      return I18n['com.affine.whiteboard.board.column.status']();
    case 'Assignee':
      return I18n['com.affine.whiteboard.board.column.assignee']();
    case 'Due':
      return I18n['com.affine.whiteboard.board.column.due']();
    case 'Labels':
      return I18n['com.affine.whiteboard.board.column.labels']();
    case 'Cover':
      return I18n['com.affine.whiteboard.board.column.cover']();
    case 'Time spent':
      return I18n['com.affine.whiteboard.board.column.time-spent']();
    case 'Started':
      return I18n['com.affine.whiteboard.board.column.started']();
    case 'Files':
      return I18n['com.affine.whiteboard.board.column.files']();
    default:
      return name;
  }
}

function localizeOptionValue(value: string): string {
  switch (value) {
    case 'To do':
      return I18n['com.affine.whiteboard.board.status.todo']();
    case 'In progress':
      return I18n['com.affine.whiteboard.board.status.in-progress']();
    case 'Done':
      return I18n['com.affine.whiteboard.board.status.done']();
    case 'Backlog':
      return I18n['com.affine.whiteboard.board.status.backlog']();
    case 'Review':
      return I18n['com.affine.whiteboard.board.status.review']();
    case 'Bug':
      return I18n['com.affine.whiteboard.board.label.bug']();
    case 'Feature':
      return I18n['com.affine.whiteboard.board.label.feature']();
    case 'Docs':
      return I18n['com.affine.whiteboard.board.label.docs']();
    default:
      return value;
  }
}

function seedTitles(template: BoardTemplate): string[] {
  return template === 'project'
    ? [
        I18n['com.affine.whiteboard.board.seed.discovery'](),
        I18n['com.affine.whiteboard.board.seed.build'](),
        I18n['com.affine.whiteboard.board.seed.review'](),
      ]
    : [
        I18n['com.affine.whiteboard.board.seed.task-1'](),
        I18n['com.affine.whiteboard.board.seed.task-2'](),
        I18n['com.affine.whiteboard.board.seed.task-3'](),
      ];
}

function addSelectOptions(
  datasource: DatabaseBlockDataSource,
  propertyId: string,
  options: BoardStatusOption[]
) {
  if (!options.length) return;
  datasource.propertyDataSet(propertyId, {
    options: options.map(option => ({
      id: nanoid(),
      value: localizeOptionValue(option.value),
      color: option.color,
    })),
  });
}

function seedColumns(
  datasource: DatabaseBlockDataSource,
  columns: BoardColumnSeed[]
) {
  for (const column of columns) {
    const id = datasource.propertyAdd('end', {
      type: column.type,
      name: localizeColumnName(column.name),
    });
    if (id && column.options) {
      addSelectOptions(datasource, id, column.options);
    }
  }
}

function firstPropertyOfType(
  datasource: DatabaseBlockDataSource,
  type: string
) {
  return datasource.properties$.value.find(
    id => datasource.propertyTypeGet(id) === type
  );
}

function selectOptions(
  datasource: DatabaseBlockDataSource,
  propertyId: string
): SelectOption[] {
  const data = datasource.propertyDataGet(propertyId) as {
    options?: SelectOption[];
  };
  return data.options ?? [];
}

function seedChecklist(store: Store, rowId: string) {
  store.addBlock(
    'affine:list',
    {
      type: 'todo',
      text: new Text(I18n['com.affine.whiteboard.board.seed.checklist']()),
      checked: false,
    },
    rowId
  );
}

function seedCards(
  store: Store,
  datasource: DatabaseBlockDataSource,
  titles: string[],
  withChecklist: boolean
) {
  const statusId = firstPropertyOfType(datasource, 'select');
  const options = statusId ? selectOptions(datasource, statusId) : [];

  titles.forEach((title, index) => {
    const rowId = datasource.rowAdd('end');
    const row = store.getBlock(rowId)?.model;
    const text = (row?.props as { text?: Text } | undefined)?.text;
    if (text) {
      text.insert(title, 0);
    }
    const option = statusId ? options[index % options.length] : undefined;
    if (statusId && option) {
      datasource.cellValueChange(rowId, statusId, option.id);
    }
    if (withChecklist) {
      seedChecklist(store, rowId);
    }
  });
}

function applyBoardSemantics(
  datasource: DatabaseBlockDataSource,
  viewId: string | undefined,
  template: BoardTemplate
) {
  if (!viewId) return;
  const statusId = firstPropertyOfType(datasource, 'select');
  const memberId = firstPropertyOfType(datasource, 'member');
  const inProgress = statusId
    ? selectOptions(datasource, statusId).find(option => {
        const value = option.value.toLowerCase();
        return (
          value === 'in progress' ||
          value === I18n['com.affine.whiteboard.board.status.in-progress']().toLowerCase()
        );
      })
    : undefined;
  const enableLanes = template !== 'todo' && !!memberId;

  datasource.viewDataUpdate(viewId, () => ({
    groupByY: enableLanes && memberId ? { columnId: memberId } : undefined,
    groupByAxes: {
      x: statusId,
      y: enableLanes ? memberId : undefined,
    },
    wipLimits: inProgress ? { [inProgress.id]: 3 } : {},
  }));
}

function applyCoverColumn(
  datasource: DatabaseBlockDataSource,
  viewId: string | undefined
) {
  const coverId = firstPropertyOfType(datasource, 'image');
  if (!coverId || !viewId) return;
  datasource.viewDataUpdate(viewId, old => {
    const header =
      old && typeof old === 'object' && 'header' in old
        ? ((old as { header?: Record<string, unknown> }).header ?? {})
        : {};
    return {
      header: {
        ...header,
        coverColumn: coverId,
      },
    };
  });
}

function asDatabase(
  model: { flavour: string } | undefined
): DatabaseBlockModel | undefined {
  if (!model || model.flavour !== 'affine:database') return;
  return model as DatabaseBlockModel;
}

export function findKanbanViewId(datasource: DatabaseBlockDataSource) {
  return datasource.viewManager.views$.value.find(id => {
    return datasource.viewManager.viewGet(id)?.type === 'kanban';
  });
}

export function ensureKanbanView(store: Store, databaseId: string) {
  const database = asDatabase(store.getBlock(databaseId)?.model);
  if (!database) return;
  const datasource = new DatabaseBlockDataSource(database);
  const existing = findKanbanViewId(datasource);
  if (existing) {
    datasource.viewManager.setCurrentView(existing);
    return existing;
  }
  try {
    return datasource.viewManager.viewAdd('kanban');
  } catch {
    return;
  }
}

export function createBoardDatabase(
  store: Store,
  options: {
    title: string;
    template: BoardTemplate;
  }
): CreatedBoardDatabase | undefined {
  const root = store.root;
  if (!root) return;

  store.captureSync();

  const noteId = store.addBlock(
    'affine:note',
    {
      displayMode: NoteDisplayMode.DocOnly,
      xywh: '[0,0,0,0]',
      comments: { [BOARD_HUB_NOTE_FLAG]: true },
    },
    root
  );

  const databaseId = store.addBlock(
    'affine:database',
    {
      title: new Text(options.title),
      columns: [],
      cells: {},
    },
    noteId
  );

  const database = asDatabase(store.getBlock(databaseId)?.model);
  if (!database) {
    return { noteId, databaseId };
  }

  const datasource = new DatabaseBlockDataSource(database);
  seedColumns(datasource, columnsForTemplate(options.template));

  let viewId: string | undefined;
  try {
    viewId = datasource.viewManager.viewAdd('kanban');
  } catch {
    viewId = undefined;
  }
  applyCoverColumn(datasource, viewId);
  applyBoardSemantics(datasource, viewId, options.template);
  seedCards(
    store,
    datasource,
    seedTitles(options.template),
    options.template !== 'todo'
  );

  return { noteId, databaseId, viewId };
}

export function applyCardMove(
  store: Store,
  databaseId: string,
  rowId: string,
  patch: {
    xPropertyId: string;
    xValue: string;
    yPropertyId?: string;
    yValue?: string;
    yIsMember?: boolean;
  }
) {
  const database = asDatabase(store.getBlock(databaseId)?.model);
  if (!database) return;
  store.captureSync();
  const datasource = new DatabaseBlockDataSource(database);
  datasource.cellValueChange(rowId, patch.xPropertyId, patch.xValue || null);
  if (patch.yPropertyId) {
    datasource.cellValueChange(
      rowId,
      patch.yPropertyId,
      patch.yIsMember ? (patch.yValue ? [patch.yValue] : []) : patch.yValue || null
    );
  }
}

export function applyViewMeta(
  store: Store,
  databaseId: string,
  patch: {
    groupByAxes?: { x?: string; y?: string };
    wipLimits?: Record<string, number>;
    laneFilter?: string;
  }
) {
  const database = asDatabase(store.getBlock(databaseId)?.model);
  if (!database) return;
  const datasource = new DatabaseBlockDataSource(database);
  const viewId = findKanbanViewId(datasource);
  if (!viewId) return;
  datasource.viewDataUpdate(viewId, old => ({
    ...patch,
    groupByY: patch.groupByAxes
      ? patch.groupByAxes.y
        ? { columnId: patch.groupByAxes.y }
        : undefined
      : (old as { groupByY?: { columnId?: string } }).groupByY,
  }));
}

export function applyTimeLog(
  store: Store,
  databaseId: string,
  rowId: string,
  minutes: number
) {
  const database = asDatabase(store.getBlock(databaseId)?.model);
  if (!database) return;
  const datasource = new DatabaseBlockDataSource(database);
  const timeId = firstPropertyOfType(datasource, 'number');
  if (!timeId) return;
  store.captureSync();
  const current = Number(datasource.cellValueGet(rowId, timeId));
  const next = (Number.isFinite(current) ? current : 0) + minutes;
  datasource.cellValueChange(rowId, timeId, next);
}

export function findNearbyDatabaseId(
  store: Store,
  modelId: string
): string | undefined {
  const model = store.getBlock(modelId)?.model;
  if (!model) return store.getModelsByFlavour('affine:database')[0]?.id;
  if (model.flavour === 'affine:database') return model.id;
  const parent = store.getParent(model);
  if (parent?.flavour === 'affine:database') return parent.id;
  return store.getModelsByFlavour('affine:database')[0]?.id;
}

export function resolveBoardDatabase(
  store: Store,
  blockId?: string,
  linkedDocId?: string
) {
  if (linkedDocId && linkedDocId !== store.id) {
    const doc = store.workspace.getDoc(linkedDocId);
    const linked = doc?.getStore({ id: linkedDocId }) ?? store;
    return linked.getBlock(blockId ?? '')?.model;
  }
  if (!blockId) return;
  return store.getBlock(blockId)?.model;
}
