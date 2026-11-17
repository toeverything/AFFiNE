import { DatabaseBlockDataSource } from '@blocksuite/affine/blocks/database';
import {
  PeekViewExtension,
  type PeekViewService,
} from '@blocksuite/affine/components/peek';
import type { DatabaseBlockModel } from '@blocksuite/affine/model';
import { IS_MOBILE } from '@blocksuite/global/env';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { wait } from '../utils/common.js';
import { addNote } from '../utils/edgeless.js';
import { setupEditor } from '../utils/setup.js';
import {
  createStubVirtualKeyboardExtension,
  enableMobileDatabaseEditing,
  isVisible,
  touchTap,
} from './utils.js';

// Story 2.12 (MOBILE-02): touch-emulation coverage for Calendar view's
// per-day-cell "New row" button (`.calendar-new-row`), a second,
// previously-undocumented instance of List's exact hover-gate problem
// (RESEARCH.md Pitfall 2). Picked up by BOTH `vitest.mobile.config.ts`
// (mobile-context project) AND the existing, unmodified `vitest.config.ts`
// (desktop suite) — assertions branch on `IS_MOBILE` (the same
// module-load-time constant the production CSS itself gates on), mirroring
// `list-touch.spec.ts`'s own established pattern, so the identical spec
// proves both halves of MOBILE-05 in one place: mobile config -> button
// always visible; desktop config -> button remains hover-gated (unchanged).
describe('calendar view mobile touch parity (Story 2.12, MOBILE-02)', () => {
  beforeEach(async () => {
    const cleanup = await setupEditor('page', [
      createStubVirtualKeyboardExtension(),
    ]);
    return cleanup;
  });

  // Deliberately date-of-month-based (the 1st / the 15th), not "today plus
  // N days" -- avoids month-boundary flakiness (a run on the last day(s) of
  // a month would otherwise roll a relative offset into next month, where
  // `canReserveNewRow`'s `day.inMonth` gate would hide the button and
  // silently break the test's own assumptions). Both days are always in the
  // Calendar's initially-displayed month (`currentMonth = startOfDay(Date.
  // now())`), regardless of what "today" actually is when this runs.
  function dayInCurrentMonth(dayOfMonth: number) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), dayOfMonth).getTime();
  }

  async function seedCalendarWithEntry() {
    // `DatabaseBlockDataSource.readonly$` already ANDs in `IS_MOBILE &&
    // !getFlag('enable_mobile_database_editing')` (opt-in, defaults `false`)
    // -- confirmed live this session: without this, `canReserveNewRow`
    // (`!view.readonly$.value && day.inMonth`) evaluates `readonly$` true
    // under the mobile-context harness by default, hiding `.calendar-new-
    // row` for an entirely different, pre-existing reason than the CSS fix
    // under test here. Enabled before the canonical renders (directly on
    // `doc`, not through a separately-constructed `Store` the way a
    // `database-view-ref` reference would be -- `list-touch.spec.ts`'s own
    // `enableFlagOnRenderedRow` re-enable-after-render step is therefore not
    // needed here).
    enableMobileDatabaseEditing(doc);
    const noteId = addNote(doc);
    const canonicalDbId = doc.addBlock('affine:database', {}, noteId);
    const canonicalModel = doc.getModelById(
      canonicalDbId
    ) as DatabaseBlockModel;
    const dataSource = new DatabaseBlockDataSource(canonicalModel);
    const rowId = dataSource.rowAdd('end');
    const seededDate = dayInCurrentMonth(1);
    dataSource.setDueDateForRow(editor.std, rowId, seededDate);

    const calendarViewId = dataSource.viewManager.viewAdd('calendar');
    // Mirrors `due-date-calendar-navigation.spec.ts`'s own established
    // pattern: `viewAdd`'s own `setCurrentView` only updates the throwaway
    // view manager constructed here to call it, not the actually-rendered
    // component's own, separate view manager instance/signal chain.
    doc.updateBlock(canonicalModel, { currentViewId: calendarViewId });
    await wait(300);

    return { dataSource, canonicalModel, rowId, seededDate };
  }

  function getDayCell(date: number) {
    return document.querySelector(
      `.calendar-day[data-date="${date}"]`
    ) as HTMLElement | null;
  }

  function getCalendarRenderer() {
    return document.querySelector('affine-data-view-calendar') as
      | (HTMLElement & {
          logic: {
            view: { readonly$: { value: boolean } };
            // `moveMonth`/`goToday` write this plain field directly
            // (`calendar/pc/view.ts:161,216-229`) -- reading it numerically
            // is a more reliable chronological-ordering assertion than
            // parsing the `.calendar-title` formatted label text.
            currentMonth: number;
          };
          requestUpdate: () => void;
          updateComplete: Promise<boolean>;
        })
      | null;
  }

  // Behavior Test 1 + 4: a `.calendar-new-row` button for a day cell that
  // already has an entry (so it is genuinely the per-day-cell button, not
  // the separate empty-month-hint's own "New row" action) is visible under
  // `IS_MOBILE` without any simulated `:hover`/`:focus-visible`, and remains
  // hover-gated (invisible by default) under the existing desktop config for
  // the identical day cell -- proven by branching the very same assertion on
  // `IS_MOBILE`, matching `list-touch.spec.ts`'s own established pattern.
  test('the .calendar-new-row button for a day with an existing entry is visible under IS_MOBILE without any simulated hover, and remains hover-gated under the desktop config (MOBILE-05)', async () => {
    const { seededDate } = await seedCalendarWithEntry();

    const dayCell = getDayCell(seededDate);
    expect(dayCell).toBeTruthy();
    // Sanity: this day genuinely already has an entry -- confirms the
    // button under test is the per-day-cell one, not the separate
    // empty-month-hint action (which only renders when the whole month has
    // zero entries).
    expect(dayCell!.querySelector('.calendar-entry')).toBeTruthy();

    const newRowButton = dayCell!.querySelector(
      '.calendar-new-row'
    ) as HTMLElement | null;
    expect(newRowButton).toBeTruthy();
    expect(isVisible(newRowButton)).toBe(IS_MOBILE);
  });

  // Behavior Test 2: the existing `canReserveNewRow` gate
  // (`!view.readonly$.value && day.inMonth`) is a render-time conditional,
  // not a CSS rule -- it must continue to fully omit `.calendar-new-row`
  // from the DOM for readonly calendar views under `IS_MOBILE`, exactly as
  // on desktop. This is a regression assertion only; no production code
  // change is required or expected for it to pass (RESEARCH.md, this plan's
  // own must_haves).
  test('no .calendar-new-row button exists in the DOM for any day cell when the view is readonly (existing canReserveNewRow gate preserved)', async () => {
    await seedCalendarWithEntry();
    const renderer = getCalendarRenderer();
    expect(renderer).toBeTruthy();

    expect(
      document.querySelectorAll('.calendar-new-row').length
    ).toBeGreaterThan(0);

    const original = renderer!.logic.view.readonly$.value;
    try {
      renderer!.logic.view.readonly$ = { value: true } as never;
      renderer!.requestUpdate();
      await renderer!.updateComplete;
      await wait();

      expect(document.querySelectorAll('.calendar-new-row').length).toBe(0);
    } finally {
      renderer!.logic.view.readonly$ = { value: original } as never;
      renderer!.requestUpdate();
      await renderer!.updateComplete;
    }
  });

  // Behavior Test 3: tapping a visible `.calendar-new-row` button invokes
  // `createRowOnDate` -- asserted on its observable effect (a new row
  // appearing, due-dated to that day) rather than an internal call spy,
  // matching this package's existing black-box test style
  // (`list-touch.spec.ts`).
  test('tapping a visible .calendar-new-row button invokes createRowOnDate (a new row appears, due-dated to that day)', async () => {
    const { dataSource, seededDate } = await seedCalendarWithEntry();
    const targetDate = dayInCurrentMonth(15);
    expect(targetDate).not.toBe(seededDate);

    const dayCell = getDayCell(targetDate);
    expect(dayCell).toBeTruthy();
    // This day starts with no entry of its own -- the row created below is
    // unambiguously the effect of this tap, not the seeded row.
    expect(dayCell!.querySelector('.calendar-entry')).toBeFalsy();

    const newRowButton = dayCell!.querySelector(
      '.calendar-new-row'
    ) as HTMLElement | null;
    expect(newRowButton).toBeTruthy();

    const rowCountBefore = dataSource.rows$.value.length;
    touchTap(newRowButton!);
    await wait(200);

    expect(dataSource.rows$.value.length).toBe(rowCountBefore + 1);
    const newRowId = dataSource.rows$.value[dataSource.rows$.value.length - 1];
    expect(dataSource.getDueDateForRow(newRowId!)).toBe(targetDate);
  });

  // ---------------------------------------------------------------------
  // Task 2: full MOBILE-02 live-verification pass -- month nav, entry-open
  // (peek/detail panel), and grid horizontal-scroll-with-legibility.
  // RESEARCH.md Open Question 1 flagged the 720px-min-width grid as an
  // unconfirmed usability risk on phone-width viewports; per this plan's
  // own priority order, this block live-tests all three assertions FIRST
  // and only escalates to a CSS-only adjustment (and, if that alone can't
  // resolve a genuine interaction-model failure, a full `calendar/mobile/`
  // fork) if any assertion actually fails -- see the SUMMARY for which
  // path was taken.
  //
  // A dedicated nested `describe` (its own `beforeEach`) rather than
  // reusing the outer block's setup: the entry-open assertion needs a real
  // `PeekViewExtension` mock registered on the editor so
  // `openCalendarEntry` -> `root.openDetailPanel` ->
  // `database-block.ts`'s `detailPanelConfig.openDetailPanel` has a
  // `PeekViewProvider` to resolve (mirrors
  // `due-date-calendar-navigation.spec.ts`'s own established pattern) --
  // harmless to also have present for the nav/grid-scroll assertions,
  // which never trigger it.
  describe('Task 2: live-verification of nav / entry-open / grid-scroll (MOBILE-02)', () => {
    let peek: ReturnType<
      typeof vi.fn<(payload: Record<string, unknown>) => void>
    >;

    beforeEach(async () => {
      peek = vi.fn();
      const cleanup = await setupEditor('page', [
        createStubVirtualKeyboardExtension(),
        PeekViewExtension({
          peek: ((payload: Record<string, unknown>) => {
            peek(payload);
            return Promise.resolve();
          }) as PeekViewService['peek'],
        }),
      ]);
      return cleanup;
    });

    // Assertion (1): tapping the month-nav prev/next buttons advances /
    // retreats the visible month chronologically, matching desktop
    // `moveMonth` behavior -- `moveMonth`/`goToday` are plain `@click`
    // handlers (`calendar/pc/view.ts:739-747` per RESEARCH.md, now
    // 976-990 in the current file), so this is a regression-only,
    // live-touch-confirmation check.
    test('tapping month-nav prev/next buttons advances/retreats the visible month chronologically', async () => {
      await seedCalendarWithEntry();
      const renderer = getCalendarRenderer();
      expect(renderer).toBeTruthy();

      const initialMonth = renderer!.logic.currentMonth;

      const nextButton = document.querySelector(
        '.calendar-icon-button[aria-label="Next month"]'
      ) as HTMLElement | null;
      expect(nextButton).toBeTruthy();
      touchTap(nextButton!);
      await wait(200);
      const afterNext = renderer!.logic.currentMonth;
      expect(afterNext).toBeGreaterThan(initialMonth);

      const prevButton = document.querySelector(
        '.calendar-icon-button[aria-label="Previous month"]'
      ) as HTMLElement | null;
      expect(prevButton).toBeTruthy();
      touchTap(prevButton!);
      await wait(200);
      touchTap(prevButton!);
      await wait(200);

      expect(renderer!.logic.currentMonth).toBeLessThan(afterNext);
      expect(renderer!.logic.currentMonth).toBeLessThan(initialMonth);
    });

    // Assertion (2): tapping an existing calendar entry opens its detail
    // view, matching desktop `handleEntryClick` -- `openEntry` ->
    // `openCalendarEntry` (`calendar/pc/actions.ts`) routes a `kind:
    // 'row'` entry through `root.openDetailPanel`, which
    // `database-block.ts`'s `detailPanelConfig.openDetailPanel`
    // implements by calling `peekViewService.peek({ target, template })`
    // for a plain (non-journal-todo-canonical) row -- asserted on that
    // observable `template` payload (not a `docId` navigation, which is
    // the journal-todo-specific special case
    // `due-date-calendar-navigation.spec.ts` covers separately), matching
    // this package's black-box test style.
    test('tapping an existing calendar entry opens its detail panel (peek called with a template), matching desktop handleEntryClick', async () => {
      const { seededDate } = await seedCalendarWithEntry();
      const dayCell = getDayCell(seededDate);
      expect(dayCell).toBeTruthy();
      const entryEl = dayCell!.querySelector(
        '.calendar-entry'
      ) as HTMLElement | null;
      expect(entryEl).toBeTruthy();

      touchTap(entryEl!);
      await wait(200);

      expect(peek).toHaveBeenCalledTimes(1);
      const [payload] = peek.mock.calls[0] as [Record<string, unknown>];
      expect(payload).not.toHaveProperty('docId');
      expect(payload).toHaveProperty('template');
    });

    // Assertion (3): `.calendar-scroll` is horizontally scrollable at the
    // 390px mobile viewport (`.calendar-shell`'s `min-width: 720px` per
    // `calendar/pc/styles.ts:61-65` forces overflow by design -- this is
    // the density UI-SPEC/RESEARCH.md's Open Question 1 already flagged,
    // not a broken layout), and day-cell / entry `min-height` legibility
    // guardrails survive scrolling unchanged. Values below are read live
    // from the current `calendar/pc/styles.ts` (112px day cells at line
    // 178, the `--calendar-entry-height: 22px` custom property entries
    // resolve to at line 260/27) rather than the plan's own approximate
    // "36px" citation, per this task's `read_first` directive to verify
    // against the actual file, not a cited line-number snapshot.
    test('.calendar-scroll is horizontally scrollable at the mobile viewport, and day-cell/entry min-height are unchanged after scrolling', async () => {
      await seedCalendarWithEntry();

      const scrollEl = document.querySelector(
        '.calendar-scroll'
      ) as HTMLElement | null;
      expect(scrollEl).toBeTruthy();
      // This file is picked up by both the mobile-context project (390px
      // viewport, `.calendar-shell`'s 720px min-width genuinely overflows
      // -- the scrollable case this assertion exists to prove) and the
      // existing desktop suite (1024x768 viewport, wide enough that the
      // 720px shell fits without overflow) -- branch on `IS_MOBILE`
      // (mirroring every other assertion in this file) rather than
      // hardcoding the mobile-only expectation, so the desktop config run
      // stays a genuine non-regression check instead of a false failure.
      if (IS_MOBILE) {
        expect(scrollEl!.scrollWidth).toBeGreaterThan(scrollEl!.clientWidth);
      } else {
        expect(scrollEl!.scrollWidth).toBeLessThanOrEqual(
          scrollEl!.clientWidth
        );
      }

      const dayCell = document.querySelector(
        '.calendar-day'
      ) as HTMLElement | null;
      const entry = document.querySelector(
        '.calendar-entry'
      ) as HTMLElement | null;
      expect(dayCell).toBeTruthy();
      expect(entry).toBeTruthy();

      const dayMinHeightBefore = getComputedStyle(dayCell!).minHeight;
      const entryMinHeightBefore = getComputedStyle(entry!).minHeight;
      expect(dayMinHeightBefore).toBe('112px');
      expect(entryMinHeightBefore).toBe('22px');

      scrollEl!.scrollLeft = 200;
      scrollEl!.dispatchEvent(new Event('scroll', { bubbles: true }));
      await wait(100);

      expect(getComputedStyle(dayCell!).minHeight).toBe(dayMinHeightBefore);
      expect(getComputedStyle(entry!).minHeight).toBe(entryMinHeightBefore);
    });
  });
});
