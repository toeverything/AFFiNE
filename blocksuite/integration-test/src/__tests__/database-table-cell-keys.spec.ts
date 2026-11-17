import { DatabaseBlockDataSource } from '@blocksuite/affine/blocks/database';
import { Text } from '@blocksuite/store';
import { beforeEach, describe, expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';

import { wait } from './utils/common.js';
import { addNote } from './utils/edgeless.js';
import { setupEditor } from './utils/setup.js';

// F-04 (inbox, 2026-11-13): in a database Table view, Enter while editing the
// title should finish editing and leave the cell selected, as in every other
// text cell; Shift+Enter is the newline. Before, the title alone made Enter a
// newline.
type TableLogic = {
  selectionController: {
    selection:
      | {
          selectionType: 'area';
          isEditing: boolean;
          focus: { rowIndex: number };
        }
      | undefined;
  };
};

describe('database Table view: keys in an editing title cell (F-04)', () => {
  beforeEach(async () => {
    const cleanup = await setupEditor('page');
    return cleanup;
  });

  async function setupEditingTitleCell() {
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
    const rowIds = [dataSource.rowAdd('end'), dataSource.rowAdd('end')];
    doc.updateBlock(doc.getModelById(rowIds[0]!)!, { text: new Text('Hello') });
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
      logic: TableLogic;
    };
    // Select the first row's title cell and start editing it, as a click
    // followed by Enter would.
    table.logic.selectionController.selection = {
      selectionType: 'area',
      groupKey: undefined,
      focus: { rowIndex: 0, columnIndex: 0 },
      rowsSelection: { start: 0, end: 0 },
      columnsSelection: { start: 0, end: 0 },
      isEditing: true,
    } as never;
    await wait(200);
    const richText = dbEl.querySelector(
      `data-view-table-row[data-row-id="${rowIds[0]}"] data-view-header-area-text rich-text`
    ) as HTMLElement & {
      inlineEditor: { yTextString: string; focusEnd: () => void };
    };
    // A real click puts the caret (and focus) in the cell, as a user would.
    await userEvent.click(richText);
    await wait(100);
    return { table, richText };
  }

  test('Enter finishes editing and leaves the cell selected, without a newline', async () => {
    const { table, richText } = await setupEditingTitleCell();
    await userEvent.keyboard('{Enter}');
    await wait(200);
    const selection = table.logic.selectionController.selection;
    expect({
      text: richText.inlineEditor.yTextString,
      isEditing: selection?.isEditing,
      row: selection?.focus.rowIndex,
    }).toEqual({ text: 'Hello', isEditing: false, row: 0 });
  });

  test('Shift+Enter inserts a newline and keeps editing', async () => {
    const { table, richText } = await setupEditingTitleCell();
    await userEvent.keyboard('{Shift>}{Enter}{/Shift}');
    await wait(200);
    const selection = table.logic.selectionController.selection;
    expect({
      text: richText.inlineEditor.yTextString,
      isEditing: selection?.isEditing,
    }).toEqual({ text: 'Hello\n', isEditing: true });
  });
});
