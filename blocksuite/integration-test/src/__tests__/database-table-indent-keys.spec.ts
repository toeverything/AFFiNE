import { DatabaseBlockDataSource } from '@blocksuite/affine/blocks/database';
import { IS_MAC } from '@blocksuite/global/env';
import { Text } from '@blocksuite/store';
import { beforeEach, describe, expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';

import { wait } from './utils/common.js';
import { addNote } from './utils/edgeless.js';
import { setupEditor } from './utils/setup.js';

// F-05 (inbox, 2026-11-13): indent / outdent keys don't work in a database
// Table view.
describe('database Table view: indent and outdent keys (F-05)', () => {
  beforeEach(async () => {
    const cleanup = await setupEditor('page');
    return cleanup;
  });

  async function setup({ plain = false } = {}) {
    const noteId = addNote(doc);
    const databaseId = doc.addBlock(
      'affine:database',
      { title: new Text() },
      noteId
    );
    await wait();
    const dataSource = new DatabaseBlockDataSource(
      doc.getModelById(databaseId)! as never
    );
    // plain: paragraph rows and no hierarchy columns, as in a database
    // made from scratch
    const addRow = () =>
      plain ? dataSource.rowAdd('end') : dataSource.rowAddAsTodoList('end');
    const rowIds = [addRow(), addRow()];
    const notesId = dataSource.propertyAdd('end', {
      type: 'rich-text',
      name: 'Notes',
    })!;
    rowIds.forEach((id, i) =>
      doc.updateBlock(doc.getModelById(id)!, { text: new Text(`Row ${i}`) })
    );
    const dbEl = document.querySelector(
      `affine-database[data-block-id="${databaseId}"]`
    ) as HTMLElement & {
      dataSource: {
        value: {
          viewManager: {
            viewAdd: (t: string) => string;
            setCurrentView: (id: string) => void;
          };
        };
      };
    };
    const vm = dbEl.dataSource.value.viewManager;
    vm.setCurrentView(vm.viewAdd('table'));
    await wait(300);
    const table = dbEl.querySelector(
      '.affine-database-table'
    ) as HTMLElement & {
      logic: { selectionController: { selection: unknown } };
    };
    const editSecondRowTitle = async () => {
      table.logic.selectionController.selection = {
        selectionType: 'area',
        groupKey: undefined,
        focus: { rowIndex: 1, columnIndex: 0 },
        rowsSelection: { start: 1, end: 1 },
        columnsSelection: { start: 0, end: 0 },
        isEditing: true,
      };
      await wait(150);
      const richText = dbEl.querySelector(
        `data-view-table-row[data-row-id="${rowIds[1]}"] data-view-header-area-text rich-text`
      ) as HTMLElement;
      await userEvent.click(richText);
      await wait(100);
    };
    const level = () => dataSource.getRowHierarchyLevel(rowIds[1]!);
    const selectSecondRowTitle = async () => {
      table.logic.selectionController.selection = {
        selectionType: 'area',
        groupKey: undefined,
        focus: { rowIndex: 1, columnIndex: 0 },
        rowsSelection: { start: 1, end: 1 },
        columnsSelection: { start: 0, end: 0 },
        isEditing: false,
      };
      await wait(150);
    };
    const editSecondRowNotes = async () => {
      const cell = dbEl.querySelector(
        `data-view-table-row[data-row-id="${rowIds[1]}"] dv-table-view-cell-container[data-column-id="${notesId}"]`
      ) as HTMLElement;
      await userEvent.click(cell);
      await wait(100);
      await userEvent.click(cell);
      await wait(150);
    };
    const firstRowLevel = () => dataSource.getRowHierarchyLevel(rowIds[0]!);
    const columnNames = () =>
      (
        doc.getModelById(databaseId)!.props as { columns: { name: string }[] }
      ).columns.map(c => c.name);
    const shownHeaders = () =>
      Array.from(dbEl.querySelectorAll('affine-database-header-column')).map(
        el => (el.textContent ?? '').trim()
      );
    return {
      editSecondRowTitle,
      selectSecondRowTitle,
      editSecondRowNotes,
      level,
      firstRowLevel,
      columnNames,
      shownHeaders,
      table,
      dbEl,
      rowIds,
    };
  }

  const mod = IS_MAC ? 'Meta' : 'Control';

  test('Mod-Shift-. indents and Mod-Shift-, outdents the row being edited', async () => {
    const { editSecondRowTitle, level } = await setup();
    await editSecondRowTitle();
    const before = level();
    await userEvent.keyboard(`{${mod}>}{Shift>}.{/Shift}{/${mod}}`);
    await wait(150);
    const indented = level();
    await userEvent.keyboard(`{${mod}>}{Shift>},{/Shift}{/${mod}}`);
    await wait(150);
    expect({ before, indented, outdented: level() }).toEqual({
      before: 0,
      indented: 1,
      outdented: 0,
    });
  });

  test('Mod-Shift-. indents and Mod-Shift-, outdents a selected row', async () => {
    const { editSecondRowTitle, level } = await setup();
    await editSecondRowTitle();
    await userEvent.keyboard('{Escape}');
    await wait(150);
    const before = level();
    await userEvent.keyboard(`{${mod}>}{Shift>}.{/Shift}{/${mod}}`);
    await wait(150);
    const indented = level();
    await userEvent.keyboard(`{${mod}>}{Shift>},{/Shift}{/${mod}}`);
    await wait(150);
    expect({ before, indented, outdented: level() }).toEqual({
      before: 0,
      indented: 1,
      outdented: 0,
    });
  });

  // Live report 2026-11-16: indent did nothing in a table made from scratch
  // (no hierarchy columns), and the keys never left a Notes cell.
  test('indents in a plain table, adding the hidden hierarchy columns', async () => {
    const { editSecondRowTitle, level, columnNames, shownHeaders } =
      await setup({ plain: true });
    await editSecondRowTitle();
    await userEvent.keyboard(`{${mod}>}{Shift>}.{/Shift}{/${mod}}`);
    await wait(150);
    const indented = level();
    await userEvent.keyboard(`{${mod}>}{Shift>},{/Shift}{/${mod}}`);
    await wait(150);
    expect({
      indented,
      outdented: level(),
      hierarchyColumns: columnNames().filter(name =>
        /^__|hierarchy|parent|ancestor/i.test(name)
      ).length,
      hidden: !shownHeaders().some(h => /hierarchy|parent|ancestor/i.test(h)),
    }).toEqual({
      indented: 1,
      outdented: 0,
      hierarchyColumns: 3,
      hidden: true,
    });
  });

  test('the first row of a plain table can not indent, and nothing is added', async () => {
    const { table, firstRowLevel, columnNames } = await setup({ plain: true });
    const before = columnNames().length;
    table.logic.selectionController.selection = {
      selectionType: 'area',
      groupKey: undefined,
      focus: { rowIndex: 0, columnIndex: 0 },
      rowsSelection: { start: 0, end: 0 },
      columnsSelection: { start: 0, end: 0 },
      isEditing: false,
    };
    await wait(150);
    await userEvent.keyboard(`{${mod}>}{Shift>}.{/Shift}{/${mod}}`);
    await wait(150);
    expect({ level: firstRowLevel(), columns: columnNames().length }).toEqual({
      level: 0,
      columns: before,
    });
  });

  for (const plain of [false, true]) {
    test(`indents and outdents while editing a Notes cell${plain ? ' (plain table)' : ''}`, async () => {
      const { editSecondRowNotes, level } = await setup({ plain });
      await editSecondRowNotes();
      await userEvent.keyboard(`{${mod}>}{Shift>}.{/Shift}{/${mod}}`);
      await wait(150);
      const indented = level();
      await userEvent.keyboard(`{${mod}>}{Shift>},{/Shift}{/${mod}}`);
      await wait(150);
      expect({ indented, outdented: level() }).toEqual({
        indented: 1,
        outdented: 0,
      });
    });
  }
});
