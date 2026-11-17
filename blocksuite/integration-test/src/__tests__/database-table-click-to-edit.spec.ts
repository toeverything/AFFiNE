import { DatabaseBlockDataSource } from '@blocksuite/affine/blocks/database';
import { Text } from '@blocksuite/store';
import { beforeEach, describe, expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';

import { wait } from './utils/common.js';
import { addNote } from './utils/edgeless.js';
import { setupEditor } from './utils/setup.js';

// F-06 (inbox, 2026-11-13): in a database Table view it took three clicks to
// start editing a cell.
type TableLogic = {
  selectionController: {
    selection: { isEditing?: boolean; selectionType?: string } | undefined;
  };
};

describe('database Table view: clicks to start editing a cell (F-06)', () => {
  beforeEach(async () => {
    const cleanup = await setupEditor('page');
    return cleanup;
  });

  async function setup() {
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
    const rowId = dataSource.rowAdd('end');
    doc.updateBlock(doc.getModelById(rowId)!, { text: new Text('Hello') });
    const textId = dataSource.propertyAdd('end', {
      type: 'rich-text',
      name: 'Notes',
    })!;
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
    const cell = (columnId: string) =>
      dbEl.querySelector(
        `data-view-table-row[data-row-id="${rowId}"] dv-table-view-cell-container[data-column-id="${columnId}"]`
      ) as HTMLElement;
    const clicksToEdit = async (target: HTMLElement) => {
      const states: string[] = [];
      for (let i = 1; i <= 4; i++) {
        await userEvent.click(target);
        await wait(150);
        const sel = table.logic.selectionController.selection;
        const editable = (document.activeElement as HTMLElement | null)
          ?.isContentEditable;
        states.push(
          `${i}: ${sel?.selectionType ?? 'none'} editing=${sel?.isEditing ?? false} focusEditable=${editable ?? false}`
        );
        if (sel?.isEditing && editable) return { clicks: i, states };
      }
      return { clicks: 0, states };
    };
    const doubleClick = async (target: HTMLElement) => {
      await userEvent.dblClick(target);
      await wait(200);
      const sel = table.logic.selectionController.selection;
      const editable = (document.activeElement as HTMLElement | null)
        ?.isContentEditable;
      return `${sel?.selectionType ?? 'none'} editing=${sel?.isEditing ?? false} focusEditable=${editable ?? false}`;
    };
    return { cell, textId, clicksToEdit, doubleClick };
  }

  test('one click selects, a second click edits the title cell', async () => {
    const { cell, clicksToEdit } = await setup();
    const result = await clicksToEdit(cell('title'));
    expect(result.clicks, result.states.join(' | ')).toBeGreaterThan(0);
    expect(result.clicks, result.states.join(' | ')).toBeLessThanOrEqual(2);
  });

  test('one click selects, a second click edits a text cell', async () => {
    const { cell, textId, clicksToEdit } = await setup();
    const result = await clicksToEdit(cell(textId));
    expect(result.clicks, result.states.join(' | ')).toBeGreaterThan(0);
    expect(result.clicks, result.states.join(' | ')).toBeLessThanOrEqual(2);
  });

  test('a double click edits the title cell', async () => {
    const { cell, doubleClick } = await setup();
    expect(await doubleClick(cell('title'))).toBe(
      'area editing=true focusEditable=true'
    );
  });

  test('a double click edits a text cell', async () => {
    const { cell, textId, doubleClick } = await setup();
    expect(await doubleClick(cell(textId))).toBe(
      'area editing=true focusEditable=true'
    );
  });

  test('while editing one cell, two clicks edit another cell', async () => {
    const { cell, textId, clicksToEdit } = await setup();
    await clicksToEdit(cell('title'));
    const result = await clicksToEdit(cell(textId));
    expect(result.clicks, result.states.join(' | ')).toBeGreaterThan(0);
    expect(result.clicks, result.states.join(' | ')).toBeLessThanOrEqual(2);
  });
});
