import { DatabaseBlockDataSource } from '@blocksuite/affine/blocks/database';
import { IS_MOBILE } from '@blocksuite/global/env';
import { Text } from '@blocksuite/store';
import { beforeEach, describe, expect, test } from 'vitest';

import { wait } from '../utils/common.js';
import { addNote } from '../utils/edgeless.js';
import { setupEditor } from '../utils/setup.js';
import {
  createStubVirtualKeyboardExtension,
  enableMobileDatabaseEditing,
  isVisible,
  touchTap,
} from './utils.js';

// Story 2.12 (MOBILE-05, the mobile-side half): confirms Table's and
// Kanban's own already-shipped mobile behavior — `mobileLogic`, a wholly
// separate component tree from `pc/` — is unaffected by this phase's new
// touch-emulation harness or by the List/Calendar CSS fixes elsewhere in
// this phase. Zero changes are made to any file under `table/` or
// `kanban/` as part of this plan (verified separately via `git diff`
// scope, per this plan's acceptance criteria) — this spec exercises the
// *rendered, touch-driven* behavior of that unmodified code, not just its
// unmodified source text.
//
// Every test below is `skipIf(!IS_MOBILE)`: `mobile-table-row`/
// `mobile-kanban-card` only render when `IS_MOBILE` (module-load-time UA
// sniff) is true (`DataViewRootUILogic.createDataViewUILogic`'s own
// `IS_MOBILE ? mobileLogic : pcLogic` resolution) — under the *desktop*
// `vitest.config.ts` project (which also picks up this file, since both
// configs' `test.include` glob matches `src/__tests__/**/*.spec.ts`), the
// same view types would render their `pc/` component trees instead, which
// this spec is not testing.
describe('Table/Kanban mobile behavior regression (Story 2.12, MOBILE-05)', () => {
  beforeEach(async () => {
    const cleanup = await setupEditor('page', [
      createStubVirtualKeyboardExtension(),
    ]);
    return cleanup;
  });

  async function createDatabase() {
    // Same finding as `list-touch.spec.ts`: `DatabaseBlockDataSource.
    // readonly$` ANDs in `IS_MOBILE && !getFlag('enable_mobile_database_
    // editing')` (opt-in, defaults `false`) -- gates `mobile-row-ops`'/
    // `mobile-card-ops`' own row/column-level `readonly$` checks (table/
    // mobile/row.ts's `!column.readonly$.value` guard, kanban/mobile/
    // card.ts's `renderOps`' `view.readonly$.value` guard). Unlike List's
    // spec, this database is created directly via `doc.addBlock` (no
    // cross-doc reference indirection), so its model shares `doc`'s own
    // `Store` instance -- setting the flag on `doc` before creation is
    // sufficient here.
    enableMobileDatabaseEditing(doc);
    const noteId = addNote(doc);
    const databaseId = doc.addBlock(
      'affine:database',
      { title: new Text() },
      noteId
    );
    await wait();
    const dbModel = doc.getModelById(databaseId)!;
    const dataSource = new DatabaseBlockDataSource(dbModel as never);
    return { databaseId, dataSource };
  }

  function getDbEl(databaseId: string) {
    return document.querySelector(
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
  }

  test.skipIf(!IS_MOBILE)(
    'Table mobile row-ops visible by default (unmodified), tap-to-open-detail fires via touch',
    async () => {
      const { viewPresets } =
        await import('@blocksuite/data-view/view-presets');
      const { databaseId, dataSource } = await createDatabase();
      const rowId = dataSource.rowAddAsTodoList('end');
      await wait();

      const dbEl = getDbEl(databaseId);
      const viewId = dbEl.dataSource.value.viewManager.viewAdd(
        viewPresets.tableViewMeta.type
      );
      dbEl.dataSource.value.viewManager.setCurrentView(viewId);
      await wait(300);

      const rowEl = dbEl.querySelector(
        `mobile-table-row[data-row-id="${rowId}"]`
      ) as
        | (HTMLElement & {
            tableViewLogic: {
              root: { openDetailPanel: (ops: unknown) => void };
            };
          })
        | null;
      expect(rowEl).toBeTruthy();

      const ops = rowEl!.querySelector('.mobile-row-ops') as HTMLElement | null;
      expect(ops).toBeTruthy();
      // Table's own already-shipped default (table/mobile/row.ts, unmodified
      // by this phase): ops are visible unless an editing-equivalent state
      // is active — no interaction is needed to reveal them, unlike
      // desktop's `:hover`-only classes.
      expect(isVisible(ops)).toBe(true);

      const detailOp = ops!.querySelector(
        '.mobile-row-op'
      ) as HTMLElement | null;
      expect(detailOp).toBeTruthy();

      let calledWith: unknown;
      const originalOpenDetailPanel =
        rowEl!.tableViewLogic.root.openDetailPanel;
      rowEl!.tableViewLogic.root.openDetailPanel = ops2 => {
        calledWith = ops2;
      };
      try {
        touchTap(detailOp!);
        expect(calledWith).toEqual(expect.objectContaining({ rowId }));
      } finally {
        rowEl!.tableViewLogic.root.openDetailPanel = originalOpenDetailPanel;
      }
    }
  );

  test.skipIf(!IS_MOBILE)(
    'Kanban mobile card renders (unmodified path), tap-to-open-detail fires via touch',
    async () => {
      const { viewPresets } =
        await import('@blocksuite/data-view/view-presets');
      const { databaseId, dataSource } = await createDatabase();
      const rowId = dataSource.rowAddAsTodoList('end');
      await wait();

      const dbEl = getDbEl(databaseId);
      const viewId = dbEl.dataSource.value.viewManager.viewAdd(
        viewPresets.kanbanViewMeta.type
      );
      dbEl.dataSource.value.viewManager.setCurrentView(viewId);
      await wait(300);

      const cardEl = dbEl.querySelector('mobile-kanban-card') as
        | (HTMLElement & {
            cardId: string;
            kanbanViewLogic: {
              root: { openDetailPanel: (ops: unknown) => void };
            };
          })
        | null;
      expect(cardEl).toBeTruthy();
      expect(cardEl!.cardId).toBe(rowId);

      const ops = cardEl!.querySelector(
        '.mobile-card-ops'
      ) as HTMLElement | null;
      expect(ops).toBeTruthy();
      expect(isVisible(ops)).toBe(true);

      const detailOp = ops!.querySelector(
        '.mobile-card-op'
      ) as HTMLElement | null;
      expect(detailOp).toBeTruthy();

      let calledWith: unknown;
      const originalOpenDetailPanel =
        cardEl!.kanbanViewLogic.root.openDetailPanel;
      cardEl!.kanbanViewLogic.root.openDetailPanel = ops2 => {
        calledWith = ops2;
      };
      try {
        touchTap(detailOp!);
        expect(calledWith).toEqual(expect.objectContaining({ rowId }));
      } finally {
        cardEl!.kanbanViewLogic.root.openDetailPanel = originalOpenDetailPanel;
      }
    }
  );
});
