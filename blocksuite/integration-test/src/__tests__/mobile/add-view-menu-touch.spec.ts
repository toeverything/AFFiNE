import { DatabaseBlockDataSource } from '@blocksuite/affine/blocks/database';
import { FeatureFlagService } from '@blocksuite/affine/shared/services';
import { viewPresets } from '@blocksuite/data-view/view-presets';
import { IS_MOBILE } from '@blocksuite/global/env';
import { Text } from '@blocksuite/store';
import { beforeEach, describe, expect, test } from 'vitest';

import { wait } from '../utils/common.js';
import { addNote } from '../utils/edgeless.js';
import { setupEditor } from '../utils/setup.js';
import {
  createStubVirtualKeyboardExtension,
  enableMobileDatabaseEditing,
  touchTap,
} from './utils.js';

// Story 2.12 (MOBILE-01): regression-verify — not re-implement — that the
// "Add View" menu already offers Table, Kanban, Calendar, List in that
// order on mobile web, and that the pre-existing (unfiltered) behavior once
// every view type is already present is unchanged. RESEARCH.md confirmed
// zero `IS_MOBILE` gating anywhere in `views-view.ts`'s `_addViewMenu`/
// `_showMore`, and `databaseBlockViews` (`database/src/views/index.ts`) is
// already `[table, kanban, calendar, list]` — this file's job is to convert
// that static-code confidence into live, touch-emulated evidence, not to
// change any production behavior. Picked up by both `vitest.mobile.config.ts`
// (this plan's mobile-context project) and the existing, unmodified
// `vitest.config.ts` (desktop suite) — `src/__tests__/**/*.spec.ts` matches
// this file's path under either config's `test.include`, so the identical
// assertions below double as the "equivalent desktop-context regression"
// acceptance criterion.
describe('add view menu touch parity (Story 2.12, MOBILE-01)', () => {
  beforeEach(async () => {
    const cleanup = await setupEditor('page', [
      createStubVirtualKeyboardExtension(),
    ]);
    return cleanup;
  });

  // New finding this session (not called out by RESEARCH.md's own
  // MOBILE-01 analysis, but the exact same pre-existing gate Plan 01 found
  // for List's row actions): `DatabaseBlockDataSource.readonly$` already
  // ANDs in `IS_MOBILE && !getFlag('enable_mobile_database_editing')`, and
  // `views-view.ts`'s own `get readonly()` reads straight through to it —
  // the "+" (`_addViewMenu`) button renders nothing at all when `readonly`
  // is true (`renderMore`'s own early `return` inside the
  // `count === views.length` branch), and `_showMore`'s "Create <Type>"
  // items are each individually `hide: () => this.readonly`. This is a
  // pre-existing, deliberate product decision (mobile database *writes* are
  // opt-in) this phase must not touch — every test below opts in the same
  // way a real device with the setting enabled would, mirroring
  // `list-touch.spec.ts`'s own established pattern, so what's under test is
  // the menu's *content/order*, not this unrelated write-gate.
  //
  // Second new finding this session: `DataViewRootUI.render()`
  // (`core/data-view.ts`) early-returns `undefined` — rendering nothing at
  // all, including the toolbar/header widget this test targets — whenever
  // `currentView$` is unset. A bare `doc.addBlock('affine:database', ...)`
  // (this file's own `database-view-ref.spec.ts`-mirrored raw-database
  // helper) starts with an empty `views` array and no current view, so the
  // "Add View" entry point genuinely doesn't exist in the DOM yet until at
  // least one view has been added — seed a single Table view here (the same
  // starting state any real user reaches via the `/database` command)
  // before this test's own "Add View" interaction is even reachable.
  function createOrdinaryDatabase() {
    enableMobileDatabaseEditing(doc);
    const noteId = addNote(doc);
    const databaseId = doc.addBlock(
      'affine:database',
      { title: new Text() },
      noteId
    );
    const dataSource = new DatabaseBlockDataSource(
      doc.getModelById(databaseId) as never
    );
    dataSource.viewManager.viewAdd(viewPresets.tableViewMeta.type);
    return { noteId, databaseId };
  }

  // New finding this session, not called out by RESEARCH.md/UI-SPEC.md:
  // `popMenu` (`@blocksuite/affine-components/context-menu`'s
  // `menu-renderer.ts`) already branches on `IS_MOBILE` at the *popup
  // shell* level, not just the button level — desktop gets a floating
  // `<affine-menu>` positioned via `@floating-ui/dom`; mobile gets a
  // completely different, full-screen bottom-sheet `<mobile-menu>` (its own
  // title bar + "Done" button, `position: absolute; height: 100%`). Both
  // reuse the exact same `menuButtonItems.action`-produced
  // `.affine-menu-action-text` content internally, just wrapped by a
  // different outer shell (`<affine-menu-button>`/`.affine-menu-button` vs.
  // `<mobile-menu-button>`/`.mobile-menu-button`) — this is *also*
  // pre-existing and already mobile-adapted, entirely untouched by this
  // phase.
  //
  // Both `<affine-menu>` and `<mobile-menu>` portal straight onto
  // `document.body`, outside the editor's own DOM subtree — a prior test's
  // popup (this suite's `beforeEach` only tears down the editor itself, via
  // `setupEditor`'s own `cleanup()`, not body-level portals) can still be
  // sitting in the document when a later test in this same file opens its
  // own. Every query below scopes to the most-recently portaled menu of
  // either shape so an earlier test's now-stale popup can never leak into a
  // later assertion.
  function latestMenu() {
    const menus = document.querySelectorAll('affine-menu, mobile-menu');
    return menus[menus.length - 1] ?? null;
  }

  function menuActionTexts() {
    return Array.from(
      latestMenu()?.querySelectorAll('.affine-menu-action-text') ?? []
    ).map(el => el.textContent?.trim());
  }

  function getAddViewButton() {
    return document.querySelector(
      '[data-testid="database-add-view-button"]'
    ) as HTMLElement | null;
  }

  // Task 04-02: `renderMore`'s fallback branch (`views-view.ts`) now wraps
  // its "N more" label in a `<span class="name">`, with the count itself
  // lowercased (`more`, not `More`) — this file's own `data-testid`
  // (`database-views-overflow-button`, added alongside that markup change)
  // is a more robust selector than matching on the button's own text
  // content, and stays correct regardless of readonly/writable state.
  function getShowMoreButton() {
    return document.querySelector(
      '[data-testid="database-views-overflow-button"]'
    ) as HTMLElement | null;
  }

  test('opening "Add View" via a tap on a freshly-created database lists Table, Kanban, Calendar, List, in that exact order', async () => {
    createOrdinaryDatabase();
    await wait(100);

    const addButton = getAddViewButton();
    expect(addButton).toBeTruthy();

    touchTap(addButton!);
    await wait();

    // `_addViewMenu` maps `dataSource.viewMetas` (== `databaseBlockViews`)
    // directly, in array order, with each entry's own `model.defaultName` as
    // the rendered label — `[VERIFIED live via touch-tap, not just code
    // reading]`.
    expect(menuActionTexts()).toEqual([
      'Table View',
      'Kanban View',
      'Calendar View',
      'List View',
    ]);
  });

  test('once all four view types already exist, "Add View" still offers all four, unfiltered — the actual pre-existing behavior, unchanged by this phase', async () => {
    const { databaseId } = createOrdinaryDatabase();
    await wait();

    // `createOrdinaryDatabase` already seeded one Table view (the minimum
    // needed for the toolbar to render at all — see its own comment); add
    // the remaining three types directly through the real view-manager, the
    // same mechanism `addView()` (`views-view.ts`) itself calls, so all four
    // types exist exactly once.
    const dataSource = new DatabaseBlockDataSource(
      doc.getModelById(databaseId) as never
    );
    dataSource.viewManager.viewAdd(viewPresets.kanbanViewMeta.type);
    dataSource.viewManager.viewAdd(viewPresets.calendarViewMeta.type);
    dataSource.viewManager.viewAdd(viewPresets.listViewMeta.type);
    await wait(200);

    // `component-overflow` measures real rendered width — with four view
    // buttons at once, whether the "+" (`_addViewMenu`) or "N More"
    // (`_showMore`) control renders depends on the actual layout the mobile
    // 390px viewport produces. Both are legitimate, unmodified entry points
    // into "offer a view type to add" — branch on whichever one this live
    // render actually produced, rather than assuming one, per this task's
    // own directive ("assert on the actual current behavior observed, do
    // not assume a specific one").
    const addButton = getAddViewButton();
    const moreButton = getShowMoreButton();
    expect(addButton ?? moreButton).toBeTruthy();

    touchTap((addButton ?? moreButton)!);
    await wait();

    if (addButton) {
      // `_addViewMenu` path: a single, unfiltered group of all four types.
      expect(menuActionTexts()).toEqual([
        'Table View',
        'Kanban View',
        'Calendar View',
        'List View',
      ]);
    } else {
      // `_showMore` path: a second "Create <Type>" group, also unfiltered —
      // confirms the same "always offer every type, regardless of what's
      // already present" behavior through the overflow menu's own entry
      // point.
      const createEntries = menuActionTexts().filter(text =>
        text?.startsWith('Create ')
      );
      expect(createEntries).toEqual([
        'Create Table View',
        'Create Kanban View',
        'Create Calendar View',
        'Create List View',
      ]);
    }
  });

  test('the overflow fallback ("N more") button shows a plus icon when writable, and omits it when readonly (Finding 2 / MOBILE-13, D-07)', async () => {
    const { databaseId } = createOrdinaryDatabase();
    await wait();

    const dataSource = new DatabaseBlockDataSource(
      doc.getModelById(databaseId) as never
    );
    dataSource.viewManager.viewAdd(viewPresets.kanbanViewMeta.type);
    dataSource.viewManager.viewAdd(viewPresets.calendarViewMeta.type);
    dataSource.viewManager.viewAdd(viewPresets.listViewMeta.type);
    await wait(200);

    // Force the overflow fallback path deterministically -- shrink
    // `component-overflow`'s own measured container width below what even
    // a single view button needs, so `Overflow.doAdjustStyle`
    // (`overflow/overflow.ts`) always falls back to rendering
    // `renderMore(0)`, regardless of the real viewport's own natural
    // layout (the sibling "once all four view types already exist" test
    // above already proves that can legitimately go either way).
    const overflowEl = document.querySelector(
      'component-overflow'
    ) as HTMLElement | null;
    expect(overflowEl).toBeTruthy();
    overflowEl!.style.width = '40px';
    await wait(200);

    const overflowButton = document.querySelector(
      '[data-testid="database-views-overflow-button"]'
    ) as HTMLElement | null;
    expect(overflowButton).toBeTruthy();
    expect(overflowButton!.querySelector('svg')).toBeTruthy();
    expect(overflowButton!.textContent?.trim()).toBe('4 more');

    // Flip the same database read-only (mirrors the existing "hidden
    // under IS_MOBILE" test's own opt-out pattern) and confirm the icon
    // is correctly omitted. The underlying data flow (`readonly$`,
    // `data-source.ts`) only actually flips to `true` when `IS_MOBILE` is
    // also true -- under the desktop config this same file is also
    // picked up by, the database stays writable regardless of this flag,
    // so the icon legitimately stays present there too.
    doc
      .get(FeatureFlagService)
      .setFlag('enable_mobile_database_editing', false);
    await wait(200);

    const overflowButtonAfter = document.querySelector(
      '[data-testid="database-views-overflow-button"]'
    ) as HTMLElement | null;
    expect(overflowButtonAfter).toBeTruthy();
    expect(!!overflowButtonAfter!.querySelector('svg')).toBe(!IS_MOBILE);
  });

  test('tap targets for adjacent Add View menu entries do not overlap (pre-existing menu-list styling, unmodified)', async () => {
    createOrdinaryDatabase();
    await wait(100);

    const addButton = getAddViewButton();
    expect(addButton).toBeTruthy();
    touchTap(addButton!);
    await wait();

    // New finding this session: the shared context-menu button component
    // already has its own `IS_MOBILE`-branched variant (`renderButton` in
    // `@blocksuite/affine-components/context-menu`'s `button.ts`) —
    // `<mobile-menu-button>` (class `.mobile-menu-button`, larger 20px
    // icon/17px text/more padding) under mobile, `<affine-menu-button>`
    // (class `.affine-menu-button`) under desktop. Pre-existing,
    // already-mobile-optimized, and entirely unrelated to this phase's own
    // scope — confirms the menu-list styling UI-SPEC/RESEARCH.md both
    // expect to be untouched genuinely already is.
    const items = Array.from(
      latestMenu()?.querySelectorAll(
        IS_MOBILE ? '.mobile-menu-button' : '.affine-menu-button'
      ) ?? []
    ) as HTMLElement[];
    expect(items.length).toBe(4);

    const rects = items.map(el => el.getBoundingClientRect());
    for (let i = 1; i < rects.length; i++) {
      // Each entry's own top edge must be at or below the previous entry's
      // bottom edge — no vertical overlap between adjacent tap targets.
      expect(rects[i]!.top).toBeGreaterThanOrEqual(rects[i - 1]!.bottom);
    }
  });

  test('the "Add View" entry point is hidden under IS_MOBILE when mobile database editing is not opted in, but stays available on desktop (pre-existing write-gate, unmodified by this phase)', async () => {
    // Deliberately does NOT call `enableMobileDatabaseEditing` — the
    // default, out-of-the-box state. Under the mobile-context project
    // (`IS_MOBILE` true) the button is gone entirely (`readonly` true,
    // `renderMore` early-returns); under the desktop config this same file
    // is also picked up by, `readonly$` never ANDs in the mobile flag at
    // all, so the button stays available exactly as before. Confirms this
    // phase's own regression check doesn't accidentally rely on (or mask)
    // the pre-existing write-gate rather than genuinely proving the menu
    // content itself. A view is still seeded directly (bypassing the UI, so
    // this direct data-source write isn't itself subject to the readonly
    // gate under test) — otherwise the toolbar wouldn't render at all under
    // either config, for the unrelated "no current view" reason documented
    // on `createOrdinaryDatabase` above.
    const noteId = addNote(doc);
    const databaseId = doc.addBlock(
      'affine:database',
      { title: new Text() },
      noteId
    );
    const dataSource = new DatabaseBlockDataSource(
      doc.getModelById(databaseId) as never
    );
    dataSource.viewManager.viewAdd(viewPresets.tableViewMeta.type);
    await wait(100);

    expect(!!getAddViewButton()).toBe(!IS_MOBILE);
  });
});
