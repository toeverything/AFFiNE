import test from 'ava';
import * as Y from 'yjs';

import { appendDatabaseRow } from '../database-row';

type FixtureColumn = {
  data?: Record<string, unknown>;
  id: string;
  name: string;
  type: string;
};

function toYMap(input: Record<string, unknown>): Y.Map<unknown> {
  const map = new Y.Map<unknown>();
  for (const [key, value] of Object.entries(input)) {
    if (Array.isArray(value)) {
      const array = new Y.Array<unknown>();
      array.push(
        value.map(item =>
          typeof item === 'object' && item
            ? toYMap(item as Record<string, unknown>)
            : item
        )
      );
      map.set(key, array);
    } else if (typeof value === 'object' && value) {
      map.set(key, toYMap(value as Record<string, unknown>));
    } else {
      map.set(key, value);
    }
  }
  return map;
}

function createDatabaseSnapshot(columnsInput?: FixtureColumn[]) {
  const columnsFixture = columnsInput ?? [
    {
      id: 'status-col',
      type: 'select',
      name: 'Status',
      data: { options: [{ id: 'todo-option', value: 'Todo' }] },
    },
  ];
  const doc = new Y.Doc();
  const blocks = doc.getMap<Y.Map<unknown>>('blocks');
  const database = new Y.Map<unknown>();

  database.set('sys:id', 'database-1');
  database.set('sys:flavour', 'affine:database');
  database.set('sys:version', 3);
  database.set('sys:children', new Y.Array<string>());
  database.set('prop:title', new Y.Text());
  const columns = new Y.Array<unknown>();
  columns.push(columnsFixture.map(toYMap));
  database.set('prop:columns', columns);
  database.set('prop:cells', new Y.Map<unknown>());
  blocks.set('database-1', database);

  return Buffer.from(Y.encodeStateAsUpdate(doc));
}

function loadSnapshot(snapshot: Buffer, update?: Buffer) {
  const doc = new Y.Doc();
  Y.applyUpdate(doc, snapshot);
  if (update) {
    Y.applyUpdate(doc, update);
  }
  return doc;
}

test('appendDatabaseRow creates a paragraph child with a Y.Text title', t => {
  const snapshot = createDatabaseSnapshot();
  const result = appendDatabaseRow(snapshot, {
    databaseBlockId: 'database-1',
    rowId: 'row-1',
    title: 'Review expenses',
  });

  t.is(result.rowId, 'row-1');

  const doc = loadSnapshot(snapshot, result.update);
  const blocks = doc.getMap<Y.Map<unknown>>('blocks');
  const database = blocks.get('database-1')!;
  const children = database.get('sys:children') as Y.Array<string>;
  const row = blocks.get('row-1')!;

  t.deepEqual(children.toArray(), ['row-1']);
  t.is(row.get('sys:id'), 'row-1');
  t.is(row.get('sys:flavour'), 'affine:paragraph');
  t.is(row.get('sys:version'), 1);
  t.is(row.get('prop:type'), 'text');
  t.is((row.get('prop:text') as Y.Text).toString(), 'Review expenses');
  t.false(row.get('prop:collapsed') as boolean);
});

test('appendDatabaseRow writes a validated select cell from Yjs column metadata', t => {
  const snapshot = createDatabaseSnapshot();
  const result = appendDatabaseRow(snapshot, {
    databaseBlockId: 'database-1',
    rowId: 'row-1',
    title: 'Review expenses',
    cells: { 'status-col': 'todo-option' },
  });

  const doc = loadSnapshot(snapshot, result.update);
  const database = doc.getMap<Y.Map<unknown>>('blocks').get('database-1')!;
  const cell = (database.get('prop:cells') as Y.Map<Y.Map<Y.Map<unknown>>>)
    .get('row-1')!
    .get('status-col')!;

  t.is(cell.get('columnId'), 'status-col');
  t.is(cell.get('value'), 'todo-option');
});

test('appendDatabaseRow rejects an unknown database column', t => {
  const error = t.throws(() =>
    appendDatabaseRow(createDatabaseSnapshot(), {
      databaseBlockId: 'database-1',
      rowId: 'row-1',
      title: 'Review expenses',
      cells: { missing: 'value' },
    })
  );

  t.is(error?.message, 'Database column missing not found');
});

test('appendDatabaseRow rejects an invalid select option', t => {
  const error = t.throws(() =>
    appendDatabaseRow(createDatabaseSnapshot(), {
      databaseBlockId: 'database-1',
      rowId: 'row-1',
      title: 'Review expenses',
      cells: { 'status-col': 'not-configured' },
    })
  );

  t.is(
    error?.message,
    'Database column status-col requires a configured select option'
  );
});

test('appendDatabaseRow validates primitive column types', t => {
  const snapshot = createDatabaseSnapshot([
    { id: 'amount-col', type: 'number', name: 'Amount' },
    { id: 'date-col', type: 'date', name: 'Date' },
    { id: 'done-col', type: 'checkbox', name: 'Done' },
  ]);
  const result = appendDatabaseRow(snapshot, {
    databaseBlockId: 'database-1',
    rowId: 'row-1',
    title: 'Expense',
    cells: { 'amount-col': 42, 'date-col': 1780000000000, 'done-col': false },
  });

  const doc = loadSnapshot(snapshot, result.update);
  const cells = doc
    .getMap<Y.Map<unknown>>('blocks')
    .get('database-1')!
    .get('prop:cells') as Y.Map<Y.Map<Y.Map<unknown>>>;

  t.is(cells.get('row-1')!.get('amount-col')!.get('value'), 42);
  t.is(cells.get('row-1')!.get('date-col')!.get('value'), 1780000000000);
  t.is(cells.get('row-1')!.get('done-col')!.get('value'), false);
});

test('appendDatabaseRow rejects non-finite number and date values', t => {
  const snapshot = createDatabaseSnapshot([
    { id: 'amount-col', type: 'number', name: 'Amount' },
    { id: 'date-col', type: 'date', name: 'Date' },
  ]);

  const numberError = t.throws(() =>
    appendDatabaseRow(snapshot, {
      databaseBlockId: 'database-1',
      rowId: 'row-number',
      title: 'Invalid amount',
      cells: { 'amount-col': Infinity },
    })
  );
  const dateError = t.throws(() =>
    appendDatabaseRow(snapshot, {
      databaseBlockId: 'database-1',
      rowId: 'row-date',
      title: 'Invalid date',
      cells: { 'date-col': Number.NaN },
    })
  );

  t.is(
    numberError?.message,
    'Database column amount-col requires a finite number'
  );
  t.is(
    dateError?.message,
    'Database column date-col requires a finite date timestamp'
  );
});

test('appendDatabaseRow rejects a missing database block', t => {
  const error = t.throws(() =>
    appendDatabaseRow(createDatabaseSnapshot(), {
      databaseBlockId: 'missing',
      rowId: 'row-1',
      title: 'Review expenses',
    })
  );

  t.is(error?.message, 'Database block missing not found');
});
