import { DatabaseBlockDataSource } from '@blocksuite/affine/blocks/database';
import { Text } from '@blocksuite/store';
import { beforeEach, describe, expect, test } from 'vitest';
import { userEvent } from 'vitest/browser';

import { wait } from './utils/common.js';
import { addNote } from './utils/edgeless.js';
import { setupEditor } from './utils/setup.js';

// F-03 (inbox, 2026-11-13): deleting a row in a database Table view jumped
// the page back to the top of the table.
type DbElement = HTMLElement & {
  dataSource: {
    value: {
      viewManager: {
        viewAdd: (type: string) => string;
        setCurrentView: (id: string) => void;
      };
    };
  };
};

function scrollContainer(from: Element): HTMLElement {
  let el: HTMLElement | null = from.parentElement;
  while (el) {
    const style = getComputedStyle(el);
    if (
      /(auto|scroll)/.test(style.overflowY) &&
      el.scrollHeight > el.clientHeight
    ) {
      return el;
    }
    el = el.parentElement;
  }
  return document.scrollingElement as HTMLElement;
}

describe('database Table view: deleting a row keeps the scroll position (F-03)', () => {
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
    const rowIds: string[] = [];
    for (let i = 0; i < 60; i++) {
      rowIds.push(dataSource.rowAdd('end'));
    }
    const dbEl = document.querySelector(
      `affine-database[data-block-id="${databaseId}"]`
    ) as DbElement;
    const vm = dbEl.dataSource.value.viewManager;
    vm.setCurrentView(vm.viewAdd('table'));
    await wait(300);

    const target = dbEl.querySelector(
      `data-view-table-row[data-row-id="${rowIds[40]}"]`
    ) as HTMLElement;
    expect(target).toBeTruthy();
    const scroller = scrollContainer(dbEl);
    target.scrollIntoView({ block: 'center' });
    await wait(100);
    const before = scroller.scrollTop;
    expect(before).toBeGreaterThan(200);

    return { dataSource, rowIds, dbEl, scroller, before };
  }

  test('deleting the row from the data keeps the scroll position', async () => {
    const { dataSource, rowIds, scroller, before } = await setup();
    dataSource.rowDelete([rowIds[40]!]);
    await wait(300);
    expect(Math.abs(scroller.scrollTop - before)).toBeLessThan(50);
  });

  test('selecting the row and pressing Backspace keeps the scroll position', async () => {
    const { rowIds, dbEl, scroller, before } = await setup();
    const table = dbEl.querySelector(
      '.affine-database-table'
    ) as HTMLElement & {
      logic: {
        selectionController: { selection: unknown };
        hotkeysController: { _handleDeleteOrBackspace: () => void };
      };
    };
    expect(table?.logic).toBeTruthy();
    table.logic.selectionController.selection = {
      selectionType: 'row',
      rows: [{ id: rowIds[40]! }],
    };
    await wait(100);
    const selected = scroller.scrollTop;
    table.logic.hotkeysController._handleDeleteOrBackspace();
    await wait(300);
    expect({ selected, after: scroller.scrollTop }).toEqual({
      selected: before,
      after: before,
    });
  });

  test('selecting three rows and pressing Backspace keeps the scroll position', async () => {
    const { rowIds, dbEl, scroller, before } = await setup();
    const table = dbEl.querySelector(
      '.affine-database-table'
    ) as HTMLElement & {
      logic: {
        selectionController: { selection: unknown };
        hotkeysController: { _handleDeleteOrBackspace: () => void };
      };
    };
    table.logic.selectionController.selection = {
      selectionType: 'row',
      rows: [{ id: rowIds[39]! }, { id: rowIds[40]! }, { id: rowIds[41]! }],
    };
    await wait(100);
    table.logic.hotkeysController._handleDeleteOrBackspace();
    await wait(300);
    expect(scroller.scrollTop).toBeCloseTo(before, -2);
  });

  test("the row menu's Delete Rows on three rows keeps the scroll position", async () => {
    const { rowIds, dbEl, scroller, before } = await setup();
    const table = dbEl.querySelector(
      '.affine-database-table'
    ) as HTMLElement & {
      logic: {
        selectionController: {
          selection: unknown;
          view: { rowsDelete: (ids: string[]) => void };
        };
        ui$: { value?: { requestUpdate: () => void } };
      };
    };
    const rows = [rowIds[39]!, rowIds[40]!, rowIds[41]!];
    table.logic.selectionController.selection = {
      selectionType: 'row',
      rows: rows.map(id => ({ id })),
    };
    await wait(100);
    // what the row menu's "Delete Rows" does (pc/menu.ts)
    table.logic.selectionController.view.rowsDelete(rows);
    table.logic.ui$.value?.requestUpdate();
    await wait(300);
    expect(scroller.scrollTop).toBeCloseTo(before, -2);
  });

  test('selecting rows by their handles and choosing Delete Rows from the row menu keeps the scroll position', async () => {
    const { rowIds, dbEl, scroller, before } = await setup();
    const handle = (id: string) =>
      dbEl.querySelector(
        `data-view-table-row[data-row-id="${id}"] .data-view-table-view-drag-handler`
      ) as HTMLElement;
    for (const id of [rowIds[39]!, rowIds[40]!, rowIds[41]!]) {
      const rowEl = dbEl.querySelector(
        `data-view-table-row[data-row-id="${id}"]`
      ) as HTMLElement;
      await userEvent.hover(rowEl);
      await wait(50);
      await userEvent.click(handle(id), { force: true } as never);
    }
    await wait(150);
    const row = dbEl.querySelector(
      `data-view-table-row[data-row-id="${rowIds[40]}"]`
    ) as HTMLElement;
    row.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        composed: true,
        clientX: 300,
        clientY: row.getBoundingClientRect().y + 5,
      })
    );
    await wait(200);
    const items = [
      ...document.querySelectorAll(
        'affine-menu-button, .affine-menu-button, [data-testid]'
      ),
    ].filter(e => /Delete Rows?/.test(e.textContent ?? ''));
    expect(items.length).toBeGreaterThan(0);
    await userEvent.click(items[items.length - 1] as HTMLElement);
    await wait(500);
    expect({
      deleted: !doc.getModelById(rowIds[40]!),
      scrollTop: Math.round(scroller.scrollTop),
    }).toEqual({ deleted: true, scrollTop: Math.round(before) });
  });

  test('deleting rows while the browser selection is inside one of them keeps the scroll position', async () => {
    const { rowIds, dbEl, scroller, before } = await setup();
    // A click on a row leaves the native (DOM) selection inside its text.
    const text = dbEl.querySelector(
      `data-view-table-row[data-row-id="${rowIds[40]}"] data-view-header-area-text rich-text [data-v-text]`
    );
    expect(text).toBeTruthy();
    const range = document.createRange();
    range.setStart(text!.firstChild ?? text!, 0);
    range.collapse(true);
    const native = document.getSelection()!;
    native.removeAllRanges();
    native.addRange(range);
    await wait(100);
    const table = dbEl.querySelector(
      '.affine-database-table'
    ) as HTMLElement & {
      logic: {
        selectionController: {
          selection: unknown;
          view: { rowsDelete: (ids: string[]) => void };
        };
        ui$: { value?: { requestUpdate: () => void } };
      };
    };
    const rows = [rowIds[39]!, rowIds[40]!, rowIds[41]!];
    table.logic.selectionController.selection = {
      selectionType: 'row',
      rows: rows.map(id => ({ id })),
    };
    await wait(100);
    // what the row menu's "Delete Rows" does (pc/menu.ts)
    table.logic.selectionController.view.rowsDelete(rows);
    table.logic.ui$.value?.requestUpdate();
    await wait(400);
    expect(Math.round(scroller.scrollTop)).toBe(Math.round(before));
  });
});
