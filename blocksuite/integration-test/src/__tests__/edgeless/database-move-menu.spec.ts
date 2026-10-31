import { DatabaseBlockDataSource } from '@blocksuite/affine/blocks/database';
import type { DatabaseRefBlockComponent } from '@blocksuite/affine/blocks/database-ref';
import {
  insertDatabaseRefBlockCommand,
  moveIntoHiddenNote,
} from '@blocksuite/affine/blocks/database-ref';
import { Text } from '@blocksuite/store';
import { beforeEach, describe, expect, test } from 'vitest';

import { wait } from '../utils/common.js';
import { addNote } from '../utils/edgeless.js';
import { setupEditor } from '../utils/setup.js';

// Story 2.3, AC6: the database's own "Move to page..." menu action must be
// gated on both (a) `DatabaseMoveProvider` being registered — an app-layer
// (`@affine/core`) concern this blocksuite-only test environment never
// wires up, mirroring exactly how `Comment`'s own `hide` gate already
// behaves the same way for `CommentProviderIdentifier` — and (b) not being
// rendered nested inside a `database-ref`/`database-view-ref` preview
// scope. This environment can only exercise (a) directly (there is no way
// to register a stub `DatabaseMoveProvider` on an already-built
// `BlockStdScope`'s resolved, read-only `ServiceProvider` — `addImpl` only
// exists on the earlier, mutable DI `Container`, not the provider handed to
// components), so this test confirms the action is absent for both a
// root-level and a nested-in-reference database (the correct behavior in
// this environment, and the safe default even before AC6's nesting gate is
// reached), plus directly verifies the DOM ancestry `this.closest(...)`
// itself relies on is structured as expected in both cases.
describe('database "Move to page..." menu action gating', () => {
  beforeEach(async () => {
    const cleanup = await setupEditor('page');
    return cleanup;
  });

  function getMenuActionNames(): string[] {
    return Array.from(
      document.querySelectorAll('.affine-menu-action-text')
    ).map(el => el.textContent?.trim() ?? '');
  }

  test('is absent on a root-level database (no DatabaseMoveProvider registered in this environment)', async () => {
    const noteId = addNote(doc);
    const databaseId = doc.addBlock(
      'affine:database',
      { title: new Text() },
      noteId
    );
    const dbModel = doc.getModelById(databaseId)!;
    new DatabaseBlockDataSource(dbModel as never).viewManager.viewAdd('table');
    await wait();

    const databaseEl = document.querySelector(
      `affine-database[data-block-id="${databaseId}"]`
    ) as HTMLElement;
    expect(databaseEl).toBeTruthy();
    expect(databaseEl.closest('affine-database-ref')).toBeFalsy();
    expect(databaseEl.closest('affine-database-view-ref')).toBeFalsy();

    const opsButton = databaseEl.querySelector(
      '[data-testid="database-ops"]'
    ) as HTMLElement;
    expect(opsButton).toBeTruthy();
    opsButton.click();
    await wait();

    expect(getMenuActionNames()).not.toContain('Move to page...');
  });

  test('is absent on a database rendered nested inside a database-ref preview', async () => {
    const noteId = addNote(doc);
    const databaseId = doc.addBlock(
      'affine:database',
      { title: new Text() },
      noteId
    );
    const dbModel = doc.getModelById(databaseId)!;
    new DatabaseBlockDataSource(dbModel as never).viewManager.viewAdd('table');
    await wait();

    const targetModel = doc.getBlock(databaseId)!.model;
    moveIntoHiddenNote(doc, targetModel);

    const secondNoteId = addNote(doc);
    const secondAnchor = doc.getBlock(secondNoteId)!.model.children[0]!;
    editor.std.command.exec(insertDatabaseRefBlockCommand, {
      refBlockId: databaseId,
      place: 'after',
      selectedModels: [secondAnchor],
    });
    await wait();

    const refEl = document.querySelector(
      'affine-database-ref'
    ) as DatabaseRefBlockComponent;
    expect(refEl).toBeTruthy();
    const nestedDatabaseEl = refEl.querySelector(
      'affine-database'
    ) as HTMLElement;
    expect(nestedDatabaseEl).toBeTruthy();
    expect(nestedDatabaseEl.closest('affine-database-ref')).toBe(refEl);

    const opsButton = nestedDatabaseEl.querySelector(
      '[data-testid="database-ops"]'
    ) as HTMLElement;
    expect(opsButton).toBeTruthy();
    opsButton.click();
    await wait();

    expect(getMenuActionNames()).not.toContain('Move to page...');
  });
});
