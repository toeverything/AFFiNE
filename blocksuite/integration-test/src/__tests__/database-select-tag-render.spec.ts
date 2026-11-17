import { DatabaseBlockDataSource } from '@blocksuite/affine/blocks/database';
import { Text } from '@blocksuite/store';
import { beforeEach, describe, expect, test } from 'vitest';

import { wait } from './utils/common.js';
import { addNote } from './utils/edgeless.js';
import { setupEditor } from './utils/setup.js';

// F-02 (inbox, 2026-11-13): in a database Table view, a newly created select
// label, or a label's new colour, didn't show in the cell until the page was
// redrawn. Both go through `property.dataUpdate` -> `updateProperty`, an
// in-place replace of one element of the block's `columns` prop inside a
// store transaction, so the rendered cell depends on the `columns$` signal
// following that Yjs change.
type SelectTag = { id: string; value: string; color: string };

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

describe('database Table view: select labels render without a redraw (F-02)', () => {
  beforeEach(async () => {
    const cleanup = await setupEditor('page');
    return cleanup;
  });

  async function setup(views = 1) {
    const noteId = addNote(doc);
    const databaseId = doc.addBlock(
      'affine:database',
      { title: new Text() },
      noteId
    );
    await wait();
    const dbModel = doc.getModelById(databaseId)!;
    const dataSource = new DatabaseBlockDataSource(dbModel as never);
    const rowId = dataSource.rowAdd('end');
    const propertyId = dataSource.propertyAdd('end', {
      type: 'select',
      name: 'Tag',
    })!;
    await wait();

    const dbEls = () =>
      Array.from(
        document.querySelectorAll(
          `affine-database[data-block-id="${databaseId}"]`
        )
      ) as DbElement[];
    for (const dbEl of dbEls()) {
      const vm = dbEl.dataSource.value.viewManager;
      vm.setCurrentView(vm.viewAdd('table'));
    }
    await wait(100);
    // A second rendering of the same database (as a reference would) is
    // what pr/18's sibling-signal path exists for; render it on demand.
    if (views > 1) {
      doc.addBlock('affine:database', { title: new Text() }, noteId);
    }

    const cellText = (dbEl: Element) => {
      const rowEl = dbEl.querySelector(
        `data-view-table-row[data-row-id="${rowId}"]`
      );
      const cell = rowEl?.querySelector(
        `[data-column-id="${propertyId}"] .affine-select-cell-container`
      );
      return cell?.textContent?.trim() ?? null;
    };
    const cellStyle = (dbEl: Element) => {
      const rowEl = dbEl.querySelector(
        `data-view-table-row[data-row-id="${rowId}"]`
      );
      const tag = rowEl?.querySelector(
        `[data-column-id="${propertyId}"] .select-selected`
      ) as HTMLElement | null;
      return tag?.getAttribute('style') ?? null;
    };
    return { dataSource, rowId, propertyId, dbEls, cellText, cellStyle };
  }

  test('a cell shows a label as soon as it is set', async () => {
    const { dataSource, rowId, propertyId, dbEls, cellText } = await setup();
    const tag: SelectTag = {
      id: 'a',
      value: 'Alpha',
      color: 'var(--affine-tag-blue)',
    };
    dataSource.propertyDataSet(propertyId, { options: [tag] });
    dataSource.cellValueChange(rowId, propertyId, tag.id);
    const seen: Record<string, string | null> = {};
    await wait(50);
    seen.at50ms = cellText(dbEls()[0]);
    await wait(500);
    seen.at550ms = cellText(dbEls()[0]);
    const vm = dbEls()[0].dataSource.value.viewManager;
    vm.setCurrentView(vm.viewAdd('table'));
    await wait(300);
    seen.afterRedraw = cellText(dbEls()[0]);
    expect(seen).toEqual({
      at50ms: 'Alpha',
      at550ms: 'Alpha',
      afterRedraw: 'Alpha',
    });
  });

  test("a new label and a label's new colour show without a redraw", async () => {
    const { dataSource, rowId, propertyId, dbEls, cellText, cellStyle } =
      await setup();
    const tag: SelectTag = {
      id: 'a',
      value: 'Alpha',
      color: 'var(--affine-tag-blue)',
    };
    dataSource.propertyDataSet(propertyId, { options: [tag] });
    dataSource.cellValueChange(rowId, propertyId, tag.id);
    await wait(50);

    // rename (what "create a label" ends in) and recolour, in place
    dataSource.propertyDataSet(propertyId, {
      options: [{ ...tag, value: 'Beta', color: 'var(--affine-tag-red)' }],
    });
    await wait(50);
    expect(cellText(dbEls()[0])).toContain('Beta');
    expect(cellStyle(dbEls()[0])).toContain('--affine-tag-red');
  });
});
