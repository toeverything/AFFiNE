import { Text } from '@blocksuite/store';
import { beforeEach, describe, expect, test } from 'vitest';

import { wait } from '../utils/common.js';
import { addNote } from '../utils/edgeless.js';
import { setupEditor } from '../utils/setup.js';

describe('repro: list view render loop with pre-existing todo rows', () => {
  beforeEach(async () => {
    const cleanup = await setupEditor('page');
    return cleanup;
  });

  test('creating a list view on a database with existing todo rows does not runaway re-render', async () => {
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
    // Multiple pre-existing todo rows — exactly the condition that made
    // `ensureRowAsTodoList`'s "is-todo" return value look like "changed"
    // forever.
    datasource.rowAddAsTodoList('end');
    datasource.rowAddAsTodoList('end');
    datasource.rowAddAsTodoList('end');
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

    // If the render loop regresses, this `wait` never actually settles
    // (the microtask queue stays permanently busy) and the test times out
    // instead of failing cleanly — which is itself the signal.
    await wait(1000);

    const listEl = dbEl.querySelector('affine-data-view-list');
    expect(listEl).toBeTruthy();
    const rows = listEl?.querySelectorAll('.affine-data-view-list-row');
    expect(rows?.length).toBe(3);
  }, 15000);
});
