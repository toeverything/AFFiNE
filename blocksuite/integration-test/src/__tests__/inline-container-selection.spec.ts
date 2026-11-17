import { DatabaseBlockDataSource } from '@blocksuite/affine/blocks/database';
import { Text } from '@blocksuite/store';
import { beforeEach, describe, expect, test } from 'vitest';

import { wait } from './utils/common.js';
import { addNote } from './utils/edgeless.js';
import { setupEditor } from './utils/setup.js';

// F-03 (inbox, 2026-11-13): deleting rows from a database table jumped the
// page to the top of the table. Traced live: deleting the rows left the
// browser selection collapsed on a wrapper of the table. Every inline editor
// inside it then saw "a container holding me is selected" and called
// focusEnd(), so the first row's title took the caret and was scrolled into
// view (the scrolling itself needs the app's viewport, so this checks the
// caret and focus).
describe('inline editor: a selected container holding several editors', () => {
  beforeEach(async () => {
    const cleanup = await setupEditor('page');
    return cleanup;
  });

  test('does not move the caret into one of them', async () => {
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
      const id = dataSource.rowAdd('end');
      doc.updateBlock(doc.getModelById(id)!, { text: new Text(`Row ${i}`) });
      rowIds.push(id);
    }
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

    // scroll to the middle of the table
    const middle = dbEl.querySelector(
      `data-view-table-row[data-row-id="${rowIds[40]}"]`
    ) as HTMLElement;
    middle.scrollIntoView({ block: 'center' });
    await wait(100);

    // An ancestor of the rows with a single child element, holding many
    // inline editors: where the selection was left after the deletion.
    let container: Element | null = middle;
    while (
      container &&
      !(
        container.querySelectorAll('[data-v-root]').length > 1 &&
        Array.from(container.childNodes).filter(n => n instanceof HTMLElement)
          .length === 1
      )
    ) {
      container = container.parentElement;
    }
    expect(container).toBeTruthy();
    const focused: string[] = [];
    const origFocus = HTMLElement.prototype.focus;
    HTMLElement.prototype.focus = function (...a) {
      focused.push(
        this.tagName +
          ' row#' +
          (this.closest('data-view-table-row') as HTMLElement | null)?.dataset
            .rowIndex
      );
      return origFocus.apply(this, a);
    };
    const range = document.createRange();
    range.setStart(container!, 0);
    range.collapse(true);
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    await wait(300);

    HTMLElement.prototype.focus = origFocus;

    const anchor = document.getSelection()?.anchorNode;
    const anchorEl =
      anchor instanceof Element ? anchor : (anchor?.parentElement ?? null);
    expect({
      focusedEditors: focused,
      caretInATitle: !!anchorEl?.closest('data-view-header-area-text'),
    }).toEqual({ focusedEditors: [], caretInATitle: false });
  });
});
