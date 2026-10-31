import { TextSelection } from '@blocksuite/std';
import { Text } from '@blocksuite/store';
import { beforeEach, describe, expect, test } from 'vitest';

import { wait } from '../utils/common.js';
import { addNote } from '../utils/edgeless.js';
import { setupEditor } from '../utils/setup.js';

describe('database slash-menu "List View" item and list-view arrow-key navigation', () => {
  beforeEach(async () => {
    const cleanup = await setupEditor('page');
    return cleanup;
  });

  test('the "List View" slash-menu item exists and inserts a database in list view', async () => {
    const { databaseSlashMenuConfig } =
      await import('@blocksuite/affine/blocks/database');
    const noteId = addNote(doc);
    const paragraphId = doc.addBlock('affine:paragraph', {}, noteId);
    const model = doc.getModelById(paragraphId)!;

    const selection = editor.std.selection.create(TextSelection, {
      from: { blockId: paragraphId, index: 0, length: 0 },
      to: null,
    });
    editor.std.selection.setGroup('note', [selection]);
    await wait();

    const items = databaseSlashMenuConfig.items;
    const resolvedItems =
      typeof items === 'function' ? items({ std: editor.std, model }) : items;
    const listViewItem = resolvedItems.find(item => item.name === 'List View');
    expect(listViewItem).toBeTruthy();
    expect(listViewItem && 'action' in listViewItem).toBeTruthy();

    await (
      listViewItem as unknown as {
        action: (ctx: { std: typeof editor.std }) => Promise<void>;
      }
    ).action({ std: editor.std });
    await wait(500);

    const databaseEl = document.querySelector('affine-database');
    expect(databaseEl).toBeTruthy();
    const listEl = databaseEl?.querySelector('affine-data-view-list');
    expect(listEl).toBeTruthy();
  });

  test('ArrowUp/ArrowDown move focus between rows in list view', async () => {
    const { DatabaseBlockDataSource } =
      await import('@blocksuite/affine/blocks/database');
    const { viewPresets } = await import('@blocksuite/data-view/view-presets');

    const noteId = addNote(doc);
    const databaseId = doc.addBlock(
      'affine:database',
      { title: new Text() },
      noteId
    );
    await wait();

    const dbModel = doc.getModelById(databaseId)!;
    const datasource = new DatabaseBlockDataSource(dbModel as never);
    const row1 = datasource.rowAddAsTodoList('end');
    const row2 = datasource.rowAddAsTodoList('end');
    const row3 = datasource.rowAddAsTodoList('end');
    await wait();

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
    const listViewId = dbEl.dataSource.value.viewManager.viewAdd(
      viewPresets.listViewMeta.type
    );
    dbEl.dataSource.value.viewManager.setCurrentView(listViewId);
    await wait(500);

    const getRowEl = (rowId: string) =>
      dbEl.querySelector(
        `.affine-data-view-list-row[data-row-id="${rowId}"]`
      ) as HTMLElement;

    const row1El = getRowEl(row1);
    expect(row1El).toBeTruthy();
    row1El.focus();
    row1El.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        bubbles: true,
        composed: true,
      })
    );
    await wait(100);

    // Focus should have moved into row2's title (a focused element
    // somewhere inside row2's own subtree).
    const row2El = getRowEl(row2);
    expect(row2El.contains(document.activeElement)).toBe(true);

    row2El.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'ArrowDown',
        bubbles: true,
        composed: true,
      })
    );
    await wait(100);
    const row3El = getRowEl(row3);
    expect(row3El.contains(document.activeElement)).toBe(true);

    row3El.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'ArrowUp',
        bubbles: true,
        composed: true,
      })
    );
    await wait(100);
    expect(row2El.contains(document.activeElement)).toBe(true);
  });
});
