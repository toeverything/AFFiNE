import { test } from '@affine-test/kit/mobile';
import { expect, type Page } from '@playwright/test';
import dayjs from 'dayjs';

import { openTab } from './utils';

// Mirrors the debug-build-only handle installed by
// `packages/frontend/apps/mobile/src/mobile-debug-framework.ts`. Declared
// structurally here rather than imported, because this test workspace does
// not (and should not) depend on the mobile app package. Typed loosely on
// purpose — only the two services this test drives are described.
// `JournalService` / `TemplateDocService` are registered in the WORKSPACE
// scope, not the root container — resolving them off the root provider fails
// with `ComponentNotFoundError` (confirmed live). They have to be reached via
// the open workspace's own `scope`, which `WorkspacesService.openByWorkspaceId`
// hands back. That call is ref-counted and reuses the already-open instance,
// so it does not open a second workspace.
interface ScopedProvider {
  get<T>(
    identifier: T
  ): T extends abstract new (...args: never) => infer R ? R : never;
}

interface AffineDebugFramework {
  provider: ScopedProvider;
  insertJournalTodoReference: (std: unknown, model: unknown) => Promise<void>;
  services: {
    JournalService: abstract new (...args: never) => {
      journalsByDate$: (date: string) => { value: { id: string }[] };
    };
    TemplateDocService: abstract new (...args: never) => {
      setting: {
        updateJournalTemplateDocId: (id?: string) => void;
        journalTemplateDocId$: { value: string | undefined };
      };
    };
    WorkspacesService: abstract new (...args: never) => {
      openByWorkspaceId: (
        id: string
      ) =>
        | { workspace: { scope: ScopedProvider }; dispose: () => void }
        | undefined;
    };
    DocsService: abstract new (...args: never) => {
      loaded: (docId: string) => unknown | null;
    };
  };
}

declare global {
  interface Window {
    __affineDebugFramework?: AffineDebugFramework;
    /** Installed by `installWorkspaceScopeHelper`, not by the app. */
    __affineWorkspaceScope: () => ScopedProvider;
  }
}

// Real end-to-end reproduction of the live "auto-selected-today" Journal
// Todo bug, built from the user's own verbatim repro steps (2026-10-06) and
// run against the MOBILE shell, which is the environment they actually hit
// it in.
//
// Why this suite exists at all, given two earlier layers already "covered"
// this bug:
//
//  - blocksuite/integration-test's journal-todo-database.spec.ts drives
//    `refreshJournalTodoOnDuplicateMiddleware` directly. It is a genuine
//    red/green test of the middleware in isolation, but it never goes
//    through `DocsService.duplicateFromTemplate`, never releases the target
//    doc (so never exercises the `finally { targetRelease() }` +
//    `ObjectPool` 1s GC teardown), and asserts on the very model object the
//    middleware wrote to rather than re-reading the doc.
//  - tests/affine-local/e2e/journal-todo-cross-doc.spec.ts's "bug 1" was
//    supposed to be the real-app confirmation, but it is a VACUOUS PASS:
//    `expect(getByText('Note color')).not.toBeVisible()` asserts the absence
//    of a string that can never be present in its own fixture, because the
//    "Note color" column is created lazily and *only* by `setNoteColor()`
//    (data-source.ts:1141, reached from the attach-note / pick-colour row
//    actions) and that fixture never attaches a note to any row. It passes
//    identically with and without the fix.
//
// Symptom (b) below — previously-completed tasks reappearing — had ZERO
// coverage anywhere under tests/ before this file.
//
// The done-date "grace window" is what makes symptom (b) possible: the
// Journal Todo filter keeps a row visible if it is undone OR was done after
// a literal `Date.now()` cutoff, and that cutoff is frozen into the view the
// instant the reference is created (the data-view filter engine has no
// "relative to now" comparison). So the ORDER of the setup below is
// load-bearing and deliberately staged:
//
//   T1  template doc gets its own `/Journal Todo` reference  -> cutoff frozen at T1
//   T2  the task is marked done                              -> T2 > T1
//   T3  today's journal is auto-created from that template
//
// Correct behaviour rewrites the duplicate's cutoff to T3, so a task done at
// T2 (< T3) is excluded and today starts fresh. The bug leaves the cutoff at
// T1, so the task done at T2 (> T1) is still inside the grace window and
// reappears in today's journal. Marking the task done BEFORE the template is
// created would be excluded either way and would make this test vacuous in
// exactly the way the desktop suite already is.
// Deliberately NOT `mode: 'serial'`: each test gets its own fresh page and
// workspace from the mobile kit fixture, so they are independent — and with
// serial mode a single failure silently SKIPS the rest, which hid two of the
// three gap tests on their first run.

const PAST_DAYS = 7;

// Generous ceiling for FIXTURE-SETTLING waits only (never for the behaviour
// under test). The suite's local `expect` timeout is 5s, which proved too
// tight once the dev server had been serving several minutes of back-to-back
// tests: the auto-select test failed in the full run purely on a setup wait
// while passing in isolation. The real assertions keep the short default so
// genuine failures still surface fast.
const SETUP_TIMEOUT = 30_000;

/**
 * Steps 1-4 of the user's own repro, shared by every test below:
 * canonical Journal Todo on a PAST date, two rows (one of which is completed
 * afterwards), a separate template doc referencing the same canonical, and
 * that doc set as the workspace Journal template.
 */
async function setupCanonicalAndTemplate(page: Page, pastDate: string) {
  // The canonical Journal Todo database, created on a PAST date (the user's
  // own setup step 1). This matters beyond realism: the canonical ends up
  // living in that past journal's doc, so every later reference to it is a
  // genuinely CROSS-doc reference — which is the only shape that can go
  // cold, and the shape a same-page database cannot reproduce.
  await installWorkspaceScopeHelper(page);
  await openJournalForDate(page, pastDate);
  await createJournalFromPlaceholder(page);
  await insertJournalTodo(page);

  // TWO tasks on the canonical, and the first one is the whole reason these
  // tests can be trusted:
  //
  //   row A  stays UNDONE forever -> must ALWAYS appear in today's journal,
  //          because undone tasks carry over by design, regardless of any
  //          done-date cutoff. This is the POSITIVE CONTROL.
  //   row B  gets completed at T2 -> must NOT appear if the cutoff was
  //          rewritten, and WILL appear if it stayed frozen at T1.
  //
  // Without row A these tests are vacuous, and that is not hypothetical: the
  // first version asserted only "no rows in today's journal" and passed even
  // with the fix fully reverted, because the cross-doc list rendered zero
  // rows full stop (measured: listRows 0, anyRowId 0). Row A turns "nothing
  // rendered" from a silent pass into a loud failure — the exact flaw that
  // made the desktop suite's own "bug 1" worthless.
  await addRow(page); // row A
  await addRow(page); // row B
  await expect(rows(page)).toHaveCount(2, { timeout: SETUP_TIMEOUT });

  // A separate template doc that references the SAME canonical. Every
  // Journal Todo insertion after the first reuses the workspace's existing
  // canonical pointer rather than creating a new table, so this is the
  // cross-doc reuse path. T1: this reference's done-date cutoff is frozen
  // here.
  const templateDocId = await createDocWithJournalTodo(page);

  // T2 (> T1): complete row B, from the past journal page.
  const pastJournalDocId = await journalDocIdForDate(page, pastDate);
  await openDoc(page, pastJournalDocId);
  await expect(page.locator('affine-database-view-ref').first()).toBeVisible({
    timeout: SETUP_TIMEOUT,
  });
  await markLastRowDone(page);

  // Point the workspace's Journal template at that doc. There is no mobile
  // UI for this at all — `updateJournalTemplateDocId` is only ever called
  // from `desktop/dialogs/setting/workspace-setting/preference/template.tsx`
  // and `desktop/pages/.../tabs/journal/*`, none of which are in the mobile
  // bundle's router, and the setting lives in the workspace userdata DB (an
  // ORM over Yjs) so it cannot be seeded from outside the app either. Hence
  // the debug-build-only framework handle (`mobile-debug-framework.ts`).
  await setJournalTemplate(page, templateDocId);

  return { templateDocId, pastJournalDocId };
}

/**
 * Boots a fresh page onto today's journal route (so the canonical's host doc
 * is genuinely COLD), guards that precondition, then taps the real
 * "create today's journal" button and waits for the duplication to settle.
 *
 * A plain `page.reload()` does NOT give a cold canonical, and that mistake
 * silently defeated an earlier version of this suite: at that point the
 * current URL IS the past journal's own doc, so reloading re-opens precisely
 * the doc hosting the canonical and warms it before the duplication runs,
 * letting the middleware's synchronous fast path succeed and hiding the
 * defect. Navigating to `/journals` instead opens no doc at all.
 */
async function createTodaysJournalColdFromTemplate(
  page: Page,
  pastJournalDocId: string
) {
  await openJournalsRouteFresh(page, dayjs().format('YYYY-MM-DD'));

  expect(
    await isDocOpen(page, pastJournalDocId),
    `PRECONDITION FAILED: the canonical's host doc (${pastJournalDocId}) must NOT be open before today's journal is created — the bug only exists when that cross-doc canonical is cold. It being open means this run tested the warm fast path instead.`
  ).toBe(false);

  await createJournalFromPlaceholder(page);

  await expect(page.locator('affine-database-view-ref').first()).toBeVisible({
    timeout: SETUP_TIMEOUT,
  });
  // `createJournal` does NOT await the template duplication (journal.ts:84
  // fires `templatePromise.catch(console.error)` and returns), and the
  // middleware's own cross-doc retry is asynchronous on top of that — so
  // settle generously before judging the result.
  await page.waitForTimeout(8000);
}

test("today's journal auto-created from a template does not inherit the template's frozen done-date cutoff", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const pastDate = dayjs().subtract(PAST_DAYS, 'day').format('YYYY-MM-DD');

  const { pastJournalDocId } = await setupCanonicalAndTemplate(page, pastDate);
  await createTodaysJournalColdFromTemplate(page, pastJournalDocId);

  // --------------------------------------------------- positive control
  await expect
    .poll(() => rows(page).count(), {
      timeout: 60_000,
      message:
        "POSITIVE CONTROL FAILED: the never-completed task (row A) must always carry over into today's journal, so the cross-doc list must render at least one row. Zero rows means this test cannot observe the bug at all and its result below must not be trusted.",
    })
    .toBeGreaterThan(0);

  // ------------------------------------------------------------ assertion
  // Symptom (b): today's auto-created Journal Todo must carry over ONLY the
  // still-undone task. Correct behaviour rewrites the cutoff to T3, so the
  // task completed at T2 is excluded -> exactly 1 row. The bug leaves the
  // cutoff frozen at T1 (< T2), so the completed task is still inside the
  // grace window and reappears -> 2 rows.
  await expect(
    rows(page),
    "today's auto-created Journal Todo must carry over only the still-undone task. 2 rows means the completed task came back too, i.e. the duplicated reference kept the template's frozen done-date cutoff instead of having it rewritten to the moment the duplicate was created."
  ).toHaveCount(1);
});

// Symptom (a) — the "note color field is visibly exposed" half of the report.
//
// "Note color" is pure plumbing (the resolved colour a row's attached note was
// seeded with) and is never meant to be user-facing. Unlike Status/Done date/
// Note/Due date, it is NOT eagerly ensured on every Journal Todo insertion —
// it springs into existence lazily, the first time ANY row anywhere gets a
// colour attached, via `setNoteColor()` -> `ensureNoteColorColumn()`
// (data-source.ts:1086-1099). That lazy creation is what makes ORDER matter,
// so both orders are tested:
//
//   BEFORE  colour attached while only the past journal's + template's
//           references exist, i.e. the column DOES exist by the time today's
//           journal is duplicated from the template.
//   AFTER   colour attached once today's journal already exists, i.e. the
//           column springs into existence with nothing left to revisit that
//           already-created reference.
//
// `ensureNoteColorColumn` re-runs `hidePropertyInViews(columnId)`
// unconditionally, but that routes through the override-aware
// `viewDataList$`/`viewDataUpdate`, so it only reaches the views of the
// DataSource instance that did the attaching. Every OTHER reference to the
// same canonical keeps a view with no `hide` entry.
test("today's journal auto-created from a template hides the Note color column when the column already existed", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const pastDate = dayjs().subtract(PAST_DAYS, 'day').format('YYYY-MM-DD');

  const { pastJournalDocId } = await setupCanonicalAndTemplate(page, pastDate);

  // Still on the past journal, whose reference renders the canonical: attach
  // a note colour here, creating the "Note color" column BEFORE today's
  // journal is duplicated from the template.
  const columnId = await attachNoteColorToFirstRow(page);
  expect(
    columnId,
    'PRECONDITION FAILED: attaching a note colour must create the lazily-created "Note color" column on the canonical. Without that column existing there is nothing to expose and this test would be vacuous — exactly the flaw in the desktop suite\'s own "bug 1".'
  ).toBeTruthy();

  await createTodaysJournalColdFromTemplate(page, pastJournalDocId);

  await expect
    .poll(() => noteColorHideStateInRenderedRef(page, columnId), {
      timeout: 60_000,
      message:
        'the "Note color" column must be hidden in the view of the journal auto-created from the template. "exposed" means it renders as an ordinary user-visible field.',
    })
    .toBe('hidden');
});

test('a journal already created from a template hides the Note color column even when the column is created afterwards', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const pastDate = dayjs().subtract(PAST_DAYS, 'day').format('YYYY-MM-DD');

  const { pastJournalDocId } = await setupCanonicalAndTemplate(page, pastDate);

  // Today's journal is created from the template FIRST, while no "Note color"
  // column exists anywhere yet.
  await createTodaysJournalColdFromTemplate(page, pastJournalDocId);
  const todaysJournalDocId = await getCurrentDocId(page);

  // Only now attach a note colour, from the PAST journal's own reference —
  // a different reference to the same canonical than today's journal's.
  await openDoc(page, pastJournalDocId);
  await expect(page.locator('affine-database-view-ref').first()).toBeVisible();
  const columnId = await attachNoteColorToFirstRow(page);
  expect(
    columnId,
    'PRECONDITION FAILED: attaching a note colour must create the "Note color" column on the canonical, otherwise this test is vacuous.'
  ).toBeTruthy();

  // Back to today's journal, which never attached a colour itself.
  await openDoc(page, todaysJournalDocId);
  await expect(page.locator('affine-database-view-ref').first()).toBeVisible();

  await expect
    .poll(() => noteColorHideStateInRenderedRef(page, columnId), {
      timeout: 60_000,
      message:
        'the "Note color" column must be hidden in an already-created journal\'s reference too, even though the column only came into existence after that journal was made and that reference never attached a colour itself. "exposed" means this plumbing column is rendering as a user-visible field with no way to ever get rid of it.',
    })
    .toBe('hidden');
});

// Symptom (b), SECOND attempt. The first version of the done-date test above
// asserts only within the SAME app session and only after an 8s settle — so
// it proves the rewrite eventually happens in memory, but says nothing about
// whether it was ever PERSISTED. That gap matters because of where the
// rewrite runs: `createJournal` (journal.ts:84) fires
// `duplicateFromTemplate` without awaiting it, and
// `duplicateFromTemplate`'s own `finally` releases both doc handles the
// moment `snapshotToSlice` returns — while the middleware's cross-doc retry
// is still outstanding. `DocsService`'s pool GCs released docs on a 1s
// interval and its `onDelete` calls `obj.scope.dispose()`, so a retry that
// resolves after that boundary can write to a doc whose scope is gone.
// In-session rendering can still show the corrected value from the live
// in-memory model while nothing ever reaches storage.
//
// This test therefore re-reads today's journal after a FULL RELOAD, which is
// the state the user actually looks at. It also reports the stored cutoff
// itself, so a failure distinguishes "cutoff is an old date" (the user's own
// hypothesis) from "cutoff is right but rows leak anyway".
test("the rewritten done-date cutoff survives a reload of today's auto-created journal", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const pastDate = dayjs().subtract(PAST_DAYS, 'day').format('YYYY-MM-DD');

  const { pastJournalDocId } = await setupCanonicalAndTemplate(page, pastDate);
  await createTodaysJournalColdFromTemplate(page, pastJournalDocId);
  const todaysJournalDocId = await getCurrentDocId(page);

  const beforeReload = await graceCutoffDiagnostics(page);
  console.log('CUTOFF before reload:', JSON.stringify(beforeReload));

  // Fully reload and come back to today's journal, the way the user does on
  // any later visit.
  await openDoc(page, todaysJournalDocId);
  await expect(page.locator('affine-database-view-ref').first()).toBeVisible({
    timeout: SETUP_TIMEOUT,
  });
  await page.waitForTimeout(8000);

  const afterReload = await graceCutoffDiagnostics(page);
  console.log('CUTOFF after reload:', JSON.stringify(afterReload));

  // Positive control, same role as row A everywhere else.
  await expect
    .poll(() => rows(page).count(), {
      timeout: 60_000,
      message:
        'POSITIVE CONTROL FAILED: the never-completed task must still carry over after a reload, so the list must render at least one row. Zero rows means this test cannot observe the bug.',
    })
    .toBeGreaterThan(0);

  await expect(
    rows(page),
    `after a reload, today's journal must still show only the still-undone task. 2 rows means the done-date cutoff rewrite did not survive — see the logged CUTOFF values for which date the filter actually ended up using. before=${JSON.stringify(beforeReload)} after=${JSON.stringify(afterReload)}`
  ).toHaveCount(1);
});

// Symptom (b), THIRD attempt — driving the literal auto-select trigger.
//
// The user is emphatic that this only reproduces via the auto-select-today
// path, never when a date is picked explicitly, and that it can only be
// attempted once per real calendar day (once today's journal exists there is
// nothing left to auto-create), which makes live UAT nearly impossible. So
// the trigger itself has to be reproduced exactly rather than approximated.
//
// Every earlier test here reaches the journal route via
// `openJournalsRouteFresh`, i.e. a full page load straight to
// `/journals?date=<today>` — which SUPPLIES the date as a query param. The
// real flow supplies no date at all: the Journal tab calls
// `workbench.open('/journals')` (mobile/components/app-tabs/journal.tsx) as
// a CLIENT-SIDE navigation inside an already-booted app, and the page then
// derives the date itself via `getDateFromUrl`, whose no-param branch falls
// back to `dayjs()`.
//
// Those two are supposed to be equivalent (both end up as today's
// `YYYY-MM-DD`), but "supposed to be equivalent" is exactly the assumption
// that produced the vacuous tests earlier in this investigation, one level
// lower down. This test therefore makes no such assumption: it boots the app
// normally, taps the real Journal tab, and taps the real "create today's
// journal" button — supplying no date anywhere.
test("today's journal created via the real auto-select Journal tab (no date supplied) starts fresh", async ({
  page,
}) => {
  test.setTimeout(240_000);
  const pastDate = dayjs().subtract(PAST_DAYS, 'day').format('YYYY-MM-DD');

  const { pastJournalDocId } = await setupCanonicalAndTemplate(page, pastDate);

  // Boot a completely fresh page on the workspace root, so the canonical's
  // host doc is cold, then reach the journal route the way the user does.
  const workspaceId = await page.evaluate(
    () => window.location.pathname.split('/')[2]
  );
  await page.goto(`/workspace/${workspaceId}/all`, {
    waitUntil: 'domcontentloaded',
  });
  await page
    .locator('#app-tabs')
    .waitFor({ state: 'visible', timeout: 90_000 });

  expect(
    await isDocOpen(page, pastJournalDocId),
    `PRECONDITION FAILED: the canonical's host doc (${pastJournalDocId}) must not be open before today's journal is auto-created.`
  ).toBe(false);

  // The literal auto-select trigger: tap the calendar/Journal tab. No date
  // is passed — `/journals` with no query param.
  await openTab(page, 'Journal');
  await page.getByTestId('confirm-create-journal-button').waitFor({
    state: 'visible',
    timeout: 90_000,
  });

  // Confirm the page really did auto-select TODAY with no date supplied,
  // rather than some other date — this is the user's own hypothesis about
  // the filter using a "crazy old date / Journal first date".
  const urlAtCreate = page.url();
  const autoSelected = await page.evaluate(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('date');
  });
  console.log(
    'AUTO-SELECT url:',
    urlAtCreate,
    '| date param:',
    JSON.stringify(autoSelected),
    '| today:',
    dayjs().format('YYYY-MM-DD')
  );

  await createJournalFromPlaceholder(page);
  await expect(page.locator('affine-database-view-ref').first()).toBeVisible({
    timeout: SETUP_TIMEOUT,
  });
  await page.waitForTimeout(8000);

  const diagnostics = await graceCutoffDiagnostics(page);
  console.log('AUTO-SELECT cutoff:', JSON.stringify(diagnostics));

  // Positive control, same role as row A elsewhere.
  await expect
    .poll(() => rows(page).count(), {
      timeout: 60_000,
      message:
        'POSITIVE CONTROL FAILED: the never-completed task must carry over, so at least one row must render. Zero rows means this test cannot observe the bug.',
    })
    .toBeGreaterThan(0);

  await expect(
    rows(page),
    `today's journal, auto-created through the real Journal-tab trigger with no date supplied, must carry over only the still-undone task. 2 rows means the completed task came back. cutoff=${JSON.stringify(diagnostics)}`
  ).toHaveCount(1);
});

// GAP 3 — the readiness bail. `applyJournalTodoRefresh` is reached via
// `const refDoc = workspace.getDoc(targetDocId); if (!refDoc) return;` — a
// HARD bail with no retry. `getDoc` reads the workspace's `blockCollections`
// Map, which `_bindDocMetaEvents()` populates reactively from
// `meta.docMetaAdded` as the root doc's metadata streams in. So on the first
// journal action of a cold session the canonical's handle may not exist yet
// and BOTH fixes are silently skipped. This is a strictly EARLIER readiness
// stage than the one cycle 1 fixed (handle exists, content still loading).
//
// Every other test in this file is structurally incapable of reaching this
// state: they create the canonical's host doc in the same session, so its
// metadata is already in the Map and `getDoc` can never return null. The
// gate below reproduces it at exactly that seam, then lets the doc "arrive"
// the way real sync eventually does — so a correct implementation must wait
// and then apply, rather than having given up permanently.
test('a cold-session duplication whose canonical doc has not yet appeared in the workspace still gets refreshed once it does', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const pastDate = dayjs().subtract(PAST_DAYS, 'day').format('YYYY-MM-DD');

  const { pastJournalDocId } = await setupCanonicalAndTemplate(page, pastDate);
  await openJournalsRouteFresh(page, dayjs().format('YYYY-MM-DD'));

  // Hide the canonical's host doc from the workspace doc list, then create
  // today's journal — the middleware will resolve `getDoc` to null.
  await gateWorkspaceGetDoc(page, pastJournalDocId);
  await createJournalFromPlaceholder(page);
  await expect(page.locator('affine-database-view-ref').first()).toBeVisible();

  const todaysJournalDocId = await getCurrentDocId(page);

  // The doc's metadata "arrives".
  await page.waitForTimeout(2500);
  await ungateWorkspaceGetDoc(page);
  await page.waitForTimeout(8000);

  // Re-open today's journal so the reference renders with the gate gone.
  // Without this the positive control cannot pass: while `getDoc` is gated,
  // the reference's own preview cannot resolve the canonical either, so the
  // list renders zero rows and the assertion below would be measuring the
  // gate rather than the middleware. Re-opening also proves the question
  // being asked is the right one — whether the refresh was EVENTUALLY
  // applied, not merely whether it rendered while blocked.
  await openDoc(page, todaysJournalDocId);
  await expect(page.locator('affine-database-view-ref').first()).toBeVisible({
    timeout: SETUP_TIMEOUT,
  });
  await page.waitForTimeout(8000);

  await expect
    .poll(() => rows(page).count(), {
      timeout: 60_000,
      message:
        'POSITIVE CONTROL FAILED: the never-completed task must carry over, so at least one row must render.',
    })
    .toBeGreaterThan(0);

  await expect(
    rows(page),
    "today's journal must end up showing only the still-undone task even though the canonical's doc had not yet appeared in the workspace doc list at duplication time. 2 rows means the middleware bailed out permanently instead of waiting for the doc to arrive."
  ).toHaveCount(1);
});

// GAP 1 — a duplicated view with NO filter never gets one installed.
// `applyJournalTodoRefresh` guards its rewrite with
// `if (doneDateColumnId && current.filter)`, so a filterless view is left
// untouched and shows EVERY row, including every previously-done task. A
// view can reach that state by a user clearing the filter, by predating the
// grace clause, or via an insertion path that never built one.
test('a duplicated reference whose view has no filter still excludes previously-completed tasks', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const pastDate = dayjs().subtract(PAST_DAYS, 'day').format('YYYY-MM-DD');

  const { templateDocId, pastJournalDocId } = await setupCanonicalAndTemplate(
    page,
    pastDate
  );

  // Strip the filter from the TEMPLATE's own reference, so the duplicate
  // inherits a filterless view.
  await openDoc(page, templateDocId);
  await expect(page.locator('affine-database-view-ref').first()).toBeVisible({
    timeout: SETUP_TIMEOUT,
  });
  await mutateRenderedRefViews(page, 'drop-filter');

  await createTodaysJournalColdFromTemplate(page, pastJournalDocId);

  await expect
    .poll(() => rows(page).count(), {
      timeout: 60_000,
      message:
        'POSITIVE CONTROL FAILED: the never-completed task must carry over, so at least one row must render.',
    })
    .toBeGreaterThan(0);

  await expect(
    rows(page),
    'a duplicated reference that arrived with no filter must still have a grace-window filter installed, so previously-completed tasks are excluded. 2 rows means it was left filterless and shows everything.'
  ).toHaveCount(1);
});

// GAP 2 — the baked `doneOption.id` is never re-resolved. The rewrite only
// ever touches the done-DATE literal; the first clause
// (`status isNotOneOf [<id>]`) keeps whatever option id was frozen in when
// the template's filter was authored. If that id no longer matches the
// canonical's current 'done' option, done rows stop matching the clause, it
// evaluates TRUE, and they stay visible no matter how correct the cutoff is.
test('a duplicated reference whose filter holds a stale done-status option id still excludes previously-completed tasks', async ({
  page,
}) => {
  test.setTimeout(240_000);
  const pastDate = dayjs().subtract(PAST_DAYS, 'day').format('YYYY-MM-DD');

  const { templateDocId, pastJournalDocId } = await setupCanonicalAndTemplate(
    page,
    pastDate
  );

  await openDoc(page, templateDocId);
  await expect(page.locator('affine-database-view-ref').first()).toBeVisible({
    timeout: SETUP_TIMEOUT,
  });
  await mutateRenderedRefViews(page, 'stale-done-option');

  await createTodaysJournalColdFromTemplate(page, pastJournalDocId);

  await expect
    .poll(() => rows(page).count(), {
      timeout: 60_000,
      message:
        'POSITIVE CONTROL FAILED: the never-completed task must carry over, so at least one row must render.',
    })
    .toBeGreaterThan(0);

  await expect(
    rows(page),
    "a duplicated reference whose status clause holds a stale 'done' option id must have it re-resolved against the canonical, so previously-completed tasks are still excluded. 2 rows means the stale id let them through."
  ).toHaveCount(1);
});

// ---------------------------------------------------------------- helpers

function rows(page: Page) {
  return page.locator('.affine-data-view-list-row[data-row-id]');
}

/**
 * A full-page navigation re-boots the whole app, which takes tens of seconds
 * in a dev build — far longer than the suite's 5s `expect` timeout.
 */
async function waitForEditor(page: Page) {
  await page
    .locator('.affine-page-viewport')
    .first()
    .waitFor({ state: 'visible', timeout: 90_000 });
}

async function openJournalForDate(page: Page, date: string) {
  await page.evaluate(date => {
    window.location.href = `${window.location.origin}${window.location.pathname.replace(/\/workspace\/([^/]+).*/, '/workspace/$1')}/journals?date=${date}`;
  }, date);
  await page.getByTestId('confirm-create-journal-button').waitFor({
    state: 'visible',
    timeout: 60_000,
  });
}

async function createJournalFromPlaceholder(page: Page) {
  await page.getByTestId('confirm-create-journal-button').click();
  await waitForEditor(page);
}

/**
 * Inserts a Journal Todo the way the mobile UI does — by calling the very
 * function the mobile keyboard toolbar's own "Journal Todo" button calls
 * (`keyboard-toolbar/src/config.ts:980`,
 * `insertJournalTodoReference(std, model)`).
 *
 * The desktop suite's route (type `/Journal Todo`, click the menu item)
 * cannot work here, and this was confirmed live rather than assumed:
 *  - `affine-slash-menu-widget` is not present in the mobile shell at all
 *    (locator count 0), so there is no slash menu to open; and
 *  - typing `/` does insert the character but never opens a menu, because
 *    on mobile `affine-note` is the contenteditable editing host (the page
 *    root is `contenteditable=false`), so `document.activeElement` is
 *    `AFFINE-NOTE` and the per-inline-editor `beforeInput` routing the
 *    widget relies on never resolves an inline editor.
 * Driving the keyboard toolbar button itself is also not possible headless:
 * the toolbar only appears once a real virtual keyboard does, and
 * `createVisualViewportVirtualKeyboardProvider()` is driven by
 * `visualViewport` resize events that emulation never fires.
 */
async function insertJournalTodo(page: Page) {
  await page.evaluate(async () => {
    const handle = window.__affineDebugFramework;
    if (!handle) throw new Error('debug framework handle absent');
    const root = document.querySelector('affine-page-root') as unknown as {
      std: unknown;
    } | null;
    const paragraph = document.querySelector('affine-paragraph') as unknown as {
      model: unknown;
    } | null;
    if (!root?.std) throw new Error('no affine-page-root/std');
    if (!paragraph?.model) throw new Error('no affine-paragraph/model');
    await handle.insertJournalTodoReference(root.std, paragraph.model);
  });
  await expect(page.locator('affine-database-view-ref').first()).toBeVisible({
    timeout: SETUP_TIMEOUT,
  });
}

async function createDocWithJournalTodo(page: Page) {
  await openTab(page, 'New Page');
  await waitForEditor(page);
  // Deliberately not typing a title: on mobile the editing host is
  // `affine-note`, so `keyboard.type` is unreliable here (see
  // `insertJournalTodo`'s comment) and the title is irrelevant to this test.
  await insertJournalTodo(page);
  return getCurrentDocId(page);
}

async function addRow(page: Page) {
  const countBefore = await rows(page).count();
  await page.locator('.new-record').first().click();
  await expect(rows(page)).toHaveCount(countBefore + 1, {
    timeout: SETUP_TIMEOUT,
  });
}

/**
 * Rows are identified by position, not by typed text — for the same mobile
 * focus reason `insertJournalTodo` documents, `keyboard.type` into a row
 * title is unreliable here. The assertions below count rows rather than
 * matching their text, so the row's title content is irrelevant.
 */
async function markLastRowDone(page: Page) {
  const row = rows(page).last();
  await expect(row).toBeVisible({ timeout: SETUP_TIMEOUT });
  await row.getByTestId('task-status-checkbox').click();
}

async function getCurrentDocId(page: Page) {
  return page.evaluate(
    () => window.location.pathname.replace(/\/+$/, '').split('/').at(-1) ?? ''
  );
}

async function openDoc(page: Page, docId: string) {
  await page.evaluate(docId => {
    const workspaceId = window.location.pathname.split('/')[2];
    window.location.href = `${window.location.origin}/workspace/${workspaceId}/${docId}`;
  }, docId);
  await waitForEditor(page);
}

/**
 * Full page load straight onto the journal route for `date`, so no doc is
 * opened during boot. Distinct from `openJournalForDate`, which assumes an
 * already-running app.
 */
async function openJournalsRouteFresh(page: Page, date: string) {
  const workspaceId = await page.evaluate(
    () => window.location.pathname.split('/')[2]
  );
  await page.goto(`/workspace/${workspaceId}/journals?date=${date}`, {
    waitUntil: 'domcontentloaded',
  });
  await page.getByTestId('confirm-create-journal-button').waitFor({
    state: 'visible',
    timeout: 90_000,
  });
}

/**
 * Whether `docId` is currently open in `DocsService`'s ref-counted pool —
 * used as the "is the canonical warm?" probe. `DocsService.loaded()` returns
 * null for a doc nothing is holding open.
 */
async function isDocOpen(page: Page, docId: string) {
  return page.evaluate(docId => {
    const scope = window.__affineWorkspaceScope();
    const handle = window.__affineDebugFramework!;
    return !!scope.get(handle.services.DocsService).loaded(docId);
  }, docId);
}

async function journalDocIdForDate(page: Page, date: string) {
  return page.evaluate(date => {
    const scope = window.__affineWorkspaceScope();
    const handle = window.__affineDebugFramework!;
    const journalService = scope.get(handle.services.JournalService);
    const docs = journalService.journalsByDate$(date).value;
    if (!docs.length) throw new Error(`no journal doc for ${date}`);
    return docs[0].id;
  }, date);
}

async function setJournalTemplate(page: Page, docId: string) {
  await page.evaluate(docId => {
    const scope = window.__affineWorkspaceScope();
    const handle = window.__affineDebugFramework!;
    scope
      .get(handle.services.TemplateDocService)
      .setting.updateJournalTemplateDocId(docId);
  }, docId);
  // The setting round-trips through the workspace userdata DB (ORM over
  // Yjs), so it is not readable back synchronously.
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const scope = window.__affineWorkspaceScope();
          const handle = window.__affineDebugFramework!;
          return scope.get(handle.services.TemplateDocService).setting
            .journalTemplateDocId$.value;
        }),
      { timeout: 15_000 }
    )
    .toBe(docId);
}

/**
 * Installs `window.__affineWorkspaceScope()` — resolves the open workspace's
 * DI scope from the workspace id in the URL.
 *
 * Registered via `addInitScript` so it survives the full-page navigations
 * this test performs (`openJournalForDate` / `openDoc` assign
 * `location.href`, and step 5 reloads outright — each of which wipes
 * `window`), and also applied to the already-loaded current page, since the
 * first use happens after only a client-side route change.
 *
 * The body resolves the handle lazily at call time, because `addInitScript`
 * runs before the app has bootstrapped and installed it.
 */
const WORKSPACE_SCOPE_HELPER = () => {
  window.__affineWorkspaceScope = () => {
    const handle = window.__affineDebugFramework;
    if (!handle) throw new Error('debug framework handle absent');
    const workspaceId = window.location.pathname.split('/')[2];
    if (!workspaceId) throw new Error('no workspace id in URL');
    const workspaces = handle.provider.get(handle.services.WorkspacesService);
    const ref = workspaces.openByWorkspaceId(workspaceId);
    if (!ref) throw new Error(`workspace ${workspaceId} not open`);
    // Deliberately not disposed: the ref is counted, and holding one for the
    // test's lifetime keeps the workspace from being GC'd mid-test.
    return ref.workspace.scope;
  };
};

async function installWorkspaceScopeHelper(page: Page) {
  await page.addInitScript(WORKSPACE_SCOPE_HELPER);
  await page.evaluate(WORKSPACE_SCOPE_HELPER);
}

/**
 * Attaches a note colour to the first row of the canonical through the real
 * production path — `DatabaseBlockDataSource.setNoteColor()`, which is what
 * the note-colour row action (`database-note-property/src/actions.ts`'s
 * `pickNoteColor`) calls, and which internally runs
 * `ensureNoteColorColumn()`. Driving that row action through the mobile UI is
 * not possible headless (it lives behind a row menu that needs the virtual
 * keyboard / hover affordances), so the test calls the same function the
 * action does.
 *
 * Returns the resulting "Note color" column id.
 */
async function attachNoteColorToFirstRow(page: Page) {
  const rowId = await rows(page).first().getAttribute('data-row-id');
  if (!rowId) throw new Error('no row to attach a note colour to');
  return page
    .locator('affine-database')
    .first()
    .evaluate((el, rowId) => {
      const dataSource = (
        el as unknown as {
          dataSource?: {
            value?: {
              setNoteColor: (rowId: string, color: unknown) => void;
              getNoteColorColumn: () => { id: string } | undefined;
            };
          };
        }
      ).dataSource?.value;
      if (!dataSource) throw new Error('no DatabaseBlockDataSource on element');
      // Same shape `pickNoteColor` stores: a theme Color token, not a
      // resolved CSS string.
      dataSource.setNoteColor(rowId, {
        light: '#ffeaea',
        dark: '#4a2a2a',
      });
      return dataSource.getNoteColorColumn()?.id ?? '';
    }, rowId);
}

/**
 * Whether `columnId` is hidden in the currently-rendered
 * `affine-database-view-ref`'s own per-instance view.
 *
 * Returns 'hidden' | 'exposed' | 'no-ref' so a missing reference can never be
 * mistaken for a pass.
 */
async function noteColorHideStateInRenderedRef(page: Page, columnId: string) {
  return page.evaluate(columnId => {
    const ref = document.querySelector(
      'affine-database-view-ref'
    ) as unknown as {
      model?: {
        props?: { views?: { columns?: { id: string; hide?: boolean }[] }[] };
      };
    } | null;
    const views = ref?.model?.props?.views;
    if (!views?.length) return 'no-ref';
    return views.every(
      view => view.columns?.find(c => c.id === columnId)?.hide === true
    )
      ? 'hidden'
      : 'exposed';
  }, columnId);
}

/**
 * The done-date grace-window cutoff currently stored in the rendered
 * reference's own view, plus the doneDate cell values of every row it shows.
 * Reported rather than asserted directly, so a failure says *which* date the
 * filter is actually using instead of just "wrong number of rows".
 */
async function graceCutoffDiagnostics(page: Page) {
  return page.evaluate(() => {
    const ref = document.querySelector(
      'affine-database-view-ref'
    ) as unknown as {
      model?: {
        props?: {
          views?: {
            filter?: {
              conditions?: {
                function?: string;
                left?: { name?: string };
                args?: { value?: unknown }[];
              }[];
            };
          }[];
        };
      };
    } | null;
    const views = ref?.model?.props?.views;
    if (!views?.length) return { state: 'no-ref' as const };
    const cutoffs = views.flatMap(
      view =>
        view.filter?.conditions
          ?.filter(condition => condition.function === 'after')
          .map(condition => condition.args?.[0]?.value) ?? []
    );
    return {
      state: 'ok' as const,
      cutoffs,
      cutoffsIso: cutoffs.map(value =>
        typeof value === 'number'
          ? new Date(value).toISOString()
          : String(value)
      ),
      nowIso: new Date().toISOString(),
      renderedRows: document.querySelectorAll(
        '.affine-data-view-list-row[data-row-id]'
      ).length,
    };
  });
}

/**
 * Makes `workspace.getDoc(docId)` return null, simulating the state where
 * that doc's metadata has not yet streamed into the workspace's
 * `blockCollections` Map (which `_bindDocMetaEvents` populates reactively
 * from `meta.docMetaAdded`). This is the readiness stage BEFORE the one
 * `waitForBlockInDoc` covers: not "handle exists, content still loading" but
 * "handle does not exist yet at all".
 */
async function gateWorkspaceGetDoc(page: Page, docId: string) {
  await page.evaluate(docId => {
    const scope = window.__affineWorkspaceScope();
    const handle = window.__affineDebugFramework!;
    const workspaces = scope.get(handle.services.WorkspacesService);
    const workspaceId = window.location.pathname.split('/')[2]!;
    const collection = (
      workspaces.openByWorkspaceId(workspaceId)!.workspace as unknown as {
        docCollection: unknown;
      }
    ).docCollection as {
      getDoc: (id: string) => unknown;
      __gatedOriginalGetDoc?: (id: string) => unknown;
      __gatedDocId?: string;
    };
    if (!collection.__gatedOriginalGetDoc) {
      collection.__gatedOriginalGetDoc = collection.getDoc.bind(collection);
    }
    collection.__gatedDocId = docId;
    collection.getDoc = (id: string) =>
      id === collection.__gatedDocId
        ? null
        : collection.__gatedOriginalGetDoc!(id);
  }, docId);
}

/** Lets the gated doc "arrive", the way real metadata sync eventually does. */
async function ungateWorkspaceGetDoc(page: Page) {
  await page.evaluate(() => {
    const scope = window.__affineWorkspaceScope();
    const handle = window.__affineDebugFramework!;
    const workspaces = scope.get(handle.services.WorkspacesService);
    const workspaceId = window.location.pathname.split('/')[2]!;
    const collection = (
      workspaces.openByWorkspaceId(workspaceId)!.workspace as unknown as {
        docCollection: unknown;
      }
    ).docCollection as {
      getDoc: (id: string) => unknown;
      __gatedOriginalGetDoc?: (id: string) => unknown;
      __gatedDocId?: string;
    };
    if (collection.__gatedOriginalGetDoc) {
      collection.__gatedDocId = undefined;
      collection.getDoc = collection.__gatedOriginalGetDoc;
    }
  });
}

/** Mutates the currently-rendered reference's own stored views. */
async function mutateRenderedRefViews(
  page: Page,
  mode: 'drop-filter' | 'stale-done-option'
) {
  await page.evaluate(mode => {
    const ref = document.querySelector(
      'affine-database-view-ref'
    ) as unknown as {
      model?: { props?: { views?: unknown[] } };
    } | null;
    const views = ref?.model?.props?.views as
      | Record<string, unknown>[]
      | undefined;
    if (!views?.length) throw new Error('no rendered reference views');
    const next = views.map(view => {
      if (mode === 'drop-filter') {
        const copy = { ...view };
        delete copy.filter;
        return copy;
      }
      const filter = view.filter as
        | {
            conditions?: {
              function?: string;
              args?: { value?: unknown }[];
            }[];
          }
        | undefined;
      if (!filter?.conditions) return view;
      return {
        ...view,
        filter: {
          ...filter,
          conditions: filter.conditions.map(condition =>
            condition.function === 'isNotOneOf'
              ? {
                  ...condition,
                  args: [{ type: 'literal', value: ['stale-done-option-id'] }],
                }
              : condition
          ),
        },
      };
    });
    (ref!.model!.props as { views: unknown[] }).views = next;
  }, mode);
}
