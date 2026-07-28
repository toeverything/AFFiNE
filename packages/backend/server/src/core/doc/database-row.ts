import * as Y from 'yjs';

export type AppendDatabaseRowInput = {
  databaseBlockId: string;
  rowId: string;
  title: string;
  cells?: Record<string, string | number | boolean>;
};

export type AppendDatabaseRowResult = {
  rowId: string;
  update: Buffer;
};

function assertSafeIdentifier(value: string, field: string): void {
  if (!value || ['__proto__', 'constructor', 'prototype'].includes(value)) {
    throw new Error(`Invalid ${field}`);
  }
}

function getDatabaseBlock(
  blocks: Y.Map<Y.Map<unknown>>,
  databaseBlockId: string
): Y.Map<unknown> {
  const database = blocks.get(databaseBlockId);
  if (!database) {
    throw new Error(`Database block ${databaseBlockId} not found`);
  }
  if (!(database instanceof Y.Map)) {
    throw new Error(`Database block ${databaseBlockId} has invalid shape`);
  }
  if (database.get('sys:flavour') !== 'affine:database') {
    throw new Error(`Block ${databaseBlockId} is not an AFFiNE database`);
  }
  if (!(database.get('sys:children') instanceof Y.Array)) {
    throw new Error(`Database block ${databaseBlockId} has invalid children`);
  }
  return database;
}

type ColumnSnapshot = {
  id: string;
  type: string;
  optionIds: Set<string>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readStringField(
  source: Y.Map<unknown> | Record<string, unknown>,
  key: string
): string | undefined {
  const value = source instanceof Y.Map ? source.get(key) : source[key];
  return typeof value === 'string' ? value : undefined;
}

function readOptions(
  source: Y.Map<unknown> | Record<string, unknown>
): Set<string> {
  const data = source instanceof Y.Map ? source.get('data') : source.data;
  const rawOptions =
    data instanceof Y.Map
      ? data.get('options')
      : isRecord(data)
        ? data.options
        : undefined;
  const options =
    rawOptions instanceof Y.Array
      ? rawOptions.toArray()
      : Array.isArray(rawOptions)
        ? rawOptions
        : [];
  const ids = new Set<string>();
  for (const option of options) {
    if (option instanceof Y.Map) {
      const id = option.get('id');
      if (typeof id === 'string' && id) ids.add(id);
    } else if (isRecord(option) && typeof option.id === 'string' && option.id) {
      ids.add(option.id);
    }
  }
  return ids;
}

function readColumnSnapshot(candidate: unknown): ColumnSnapshot | undefined {
  if (!(candidate instanceof Y.Map) && !isRecord(candidate)) {
    return undefined;
  }
  const id = readStringField(candidate, 'id');
  const type = readStringField(candidate, 'type');
  if (!id || !type) {
    return undefined;
  }
  return { id, type, optionIds: readOptions(candidate) };
}

function validateCells(
  database: Y.Map<unknown>,
  cells: Record<string, string | number | boolean>
): void {
  const columns = database.get('prop:columns');
  if (!(columns instanceof Y.Array)) {
    throw new Error('Database block has invalid columns');
  }

  for (const [columnId, value] of Object.entries(cells)) {
    assertSafeIdentifier(columnId, 'column id');
    const column = columns
      .toArray()
      .map(readColumnSnapshot)
      .find(candidate => candidate?.id === columnId);
    if (!column) {
      throw new Error(`Database column ${columnId} not found`);
    }

    switch (column.type) {
      case 'number':
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          throw new Error(
            `Database column ${columnId} requires a finite number`
          );
        }
        break;
      case 'date':
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          throw new Error(
            `Database column ${columnId} requires a finite date timestamp`
          );
        }
        break;
      case 'checkbox':
        if (typeof value !== 'boolean') {
          throw new Error(`Database column ${columnId} requires a boolean`);
        }
        break;
      case 'select': {
        if (
          typeof value !== 'string' ||
          !value ||
          !column.optionIds.has(value)
        ) {
          throw new Error(
            `Database column ${columnId} requires a configured select option`
          );
        }
        break;
      }
      default:
        throw new Error(
          `Database column ${columnId} type ${String(column.type)} is not supported`
        );
    }
  }
}

function writeCells(
  database: Y.Map<unknown>,
  rowId: string,
  cells: Record<string, string | number | boolean>
): void {
  if (!Object.keys(cells).length) {
    return;
  }

  const databaseCells = database.get('prop:cells');
  if (!(databaseCells instanceof Y.Map)) {
    throw new Error('Database block has invalid cells');
  }

  const rowCells = new Y.Map<unknown>();
  for (const [columnId, value] of Object.entries(cells)) {
    const cell = new Y.Map<unknown>();
    cell.set('columnId', columnId);
    cell.set('value', value);
    rowCells.set(columnId, cell);
  }
  databaseCells.set(rowId, rowCells);
}

export function appendDatabaseRow(
  snapshot: Buffer,
  input: AppendDatabaseRowInput
): AppendDatabaseRowResult {
  assertSafeIdentifier(input.databaseBlockId, 'database block id');
  assertSafeIdentifier(input.rowId, 'row id');
  if (!input.title.trim()) {
    throw new Error('Row title must not be empty');
  }

  const doc = new Y.Doc();
  Y.applyUpdate(doc, snapshot);
  const stateVector = Y.encodeStateVector(doc);
  const blocks = doc.getMap<Y.Map<unknown>>('blocks');
  const database = getDatabaseBlock(blocks, input.databaseBlockId);

  if (blocks.has(input.rowId)) {
    throw new Error(`Row ${input.rowId} already exists`);
  }

  const cells = input.cells ?? {};
  validateCells(database, cells);

  doc.transact(() => {
    const row = new Y.Map<unknown>();
    const title = new Y.Text();
    title.insert(0, input.title);

    row.set('sys:id', input.rowId);
    row.set('sys:flavour', 'affine:paragraph');
    row.set('sys:version', 1);
    row.set('sys:children', new Y.Array<string>());
    row.set('prop:type', 'text');
    row.set('prop:text', title);
    row.set('prop:collapsed', false);

    blocks.set(input.rowId, row);
    (database.get('sys:children') as Y.Array<string>).push([input.rowId]);
    writeCells(database, input.rowId, cells);
  });

  return {
    rowId: input.rowId,
    update: Buffer.from(Y.encodeStateAsUpdate(doc, stateVector)),
  };
}
