import { DatabaseBlockDataSource } from '@blocksuite/affine/blocks/database';
import {
  PeekViewExtension,
  type PeekViewService,
} from '@blocksuite/affine/components/peek';
import type { DatabaseBlockModel } from '@blocksuite/affine/model';
import {
  JournalTodoDatabaseExtension,
  type JournalTodoDatabaseRef,
} from '@blocksuite/affine/shared/services';
import { Text } from '@blocksuite/store';
import { userEvent } from '@vitest/browser/context';
import { beforeEach, describe, expect, test, vi } from 'vitest';

import { wait } from '../utils/common.js';
import { addNote } from '../utils/edgeless.js';
import { setupEditor } from '../utils/setup.js';

// Story 2.7 (Task 4/5): a real, Playwright-driven click on a calendar entry
// backed by the journal-todo canonical must navigate to the row's own
// journal-page appearance, not open the generic row detail panel. Per this
// story's own Testing Standards ("a real Playwright userEvent test is
// likely necessary... given how much of Task 4's own correctness depends
// on genuine click/navigation behavior"), this is a real `userEvent.click`
// on the actual rendered `.calendar-entry` element — not a synthetic
// `dispatchEvent` and not a direct call into `openDetailPanel`.
//
// Renders the canonical `affine:database` *directly* on the page (not
// through a `database-view-ref`) deliberately — a reference always renders
// its nested content through a fresh, separate `BlockStdScope`
// (`database-view-ref-block.ts`'s own `render()`), which doesn't inherit
// this test's own extra `setupEditor` extensions (the exact same class of
// limitation `EditorSettingProvider` already has on nested scopes — see
// `journal-todo-database.spec.ts`'s own `showDueDateColumn` end-to-end
// test). A directly-rendered canonical has no such nesting, so both
// `JournalTodoDatabaseProvider` and `PeekViewProvider`, registered here as
// *real* extensions (not a `getOptional`-intercepting `Proxy`), resolve
// correctly off the actually-rendering component's own `this.std`.
describe('Story 2.7: calendar entry click navigates to the journal page', () => {
  let journalTodoRef: JournalTodoDatabaseRef | undefined;
  let journalDatesByDocId: Map<string, string>;
  let docIdsByJournalDate: Map<string, string>;
  let peek: ReturnType<typeof vi.fn<(pageRef: { docId: string }) => void>>;

  beforeEach(async () => {
    journalTodoRef = undefined;
    journalDatesByDocId = new Map();
    docIdsByJournalDate = new Map();
    peek = vi.fn();

    const cleanup = await setupEditor('page', [
      JournalTodoDatabaseExtension({
        getJournalDate: docId => journalDatesByDocId.get(docId),
        getJournalTodoDatabaseRef: () => journalTodoRef,
        setJournalTodoDatabaseRef: ref => {
          journalTodoRef = ref;
        },
        getJournalDocId: date => docIdsByJournalDate.get(date),
        // Story 2.11: not exercised by this suite (the canonical renders
        // directly, never through the slash-menu commands), but required
        // by the interface.
        isTemplateDoc: () => false,
      }),
      PeekViewExtension({
        peek: ((pageRef: { docId: string }) => {
          peek(pageRef);
          return Promise.resolve();
        }) as PeekViewService['peek'],
      }),
    ]);
    return cleanup;
  });

  function markJournal(docId: string, date: string) {
    journalDatesByDocId.set(docId, date);
    docIdsByJournalDate.set(date, docId);
  }

  function todayLocalDate() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  test('an undone row’s calendar entry navigates to today’s journal page on a real click', async () => {
    // Today's own journal page — the target an undone row's click should
    // resolve to.
    const todayDate = todayLocalDate();
    markJournal(doc.id, todayDate);

    const noteId = addNote(doc);
    const canonicalDbId = doc.addBlock(
      'affine:database',
      { title: new Text('Journal Todo') },
      noteId
    );
    const canonicalModel = doc.getModelById(canonicalDbId) as
      | DatabaseBlockModel
      | undefined;
    if (!canonicalModel) throw new Error('canonical database not found');
    const canonicalDataSource = new DatabaseBlockDataSource(canonicalModel);
    canonicalDataSource.ensureTaskStatusColumn();
    const rowId = canonicalDataSource.rowAddAsTodoList('end');
    // Due date "now" — lands within the calendar's default-visible month.
    canonicalDataSource.setDueDateForRow(editor.std, rowId, Date.now());

    journalTodoRef = { refDocId: doc.id, refBlockId: canonicalDbId };

    const calendarViewId = canonicalDataSource.viewManager.viewAdd('calendar');
    // Mirrors `_syncCurrentView`'s own reactive write in
    // `database-view-ref-block.ts` — `viewAdd`'s own `setCurrentView` only
    // updates the throwaway view manager constructed here to call it, not
    // the actually-rendered component's own, separate view manager
    // instance/signal chain.
    doc.updateBlock(canonicalModel, { currentViewId: calendarViewId });
    await wait(300);

    const entryEl = document.querySelector(
      '.calendar-entry.row'
    ) as HTMLElement | null;
    expect(entryEl).toBeTruthy();

    await userEvent.click(entryEl!);
    await wait(200);

    expect(peek).toHaveBeenCalledTimes(1);
    const [pageRef] = peek.mock.calls[0] as [{ docId: string }];
    expect(pageRef.docId).toBe(doc.id);
  });

  // Live bug report: creating a brand-new row from a calendar view of the
  // journal-todo canonical (the "New row" button, empty-month state) hits
  // the exact same `detailPanelConfig.openDetailPanel` code path as
  // clicking an *existing* row's entry (tested above) — which, for the
  // journal-todo canonical, always navigates to the row's journal-page
  // appearance instead of opening the row detail panel. A brand-new row
  // has no Done date yet, so `resolveJournalTodoNavigationDate` resolves
  // it to *today* regardless of which day was actually clicked on the
  // calendar — the user ends up peeking today's journal page (which, if
  // they're already working in it, looks exactly like "the note I'm
  // already in") with no way to set a title, closing that peek leaves an
  // "Untitled" calendar entry behind.
  test('creating a new row from the calendar (empty-month "New row" button) must NOT navigate to the journal page — it has no title to set there', async () => {
    const todayDate = todayLocalDate();
    markJournal(doc.id, todayDate);

    const noteId = addNote(doc);
    const canonicalDbId = doc.addBlock(
      'affine:database',
      { title: new Text('Journal Todo') },
      noteId
    );
    const canonicalModel = doc.getModelById(canonicalDbId) as
      | DatabaseBlockModel
      | undefined;
    if (!canonicalModel) throw new Error('canonical database not found');
    const canonicalDataSource = new DatabaseBlockDataSource(canonicalModel);
    canonicalDataSource.ensureTaskStatusColumn();
    // Due date column must exist for the calendar to auto-select it as its
    // date axis (`CalendarSingleView.dateMapping$`'s own `getDueDateColumn`
    // fallback) — no row needs one set yet; the empty-month hint is
    // exactly the state a fresh calendar view starts in.
    canonicalDataSource.ensureDueDateColumn(editor.std);

    journalTodoRef = { refDocId: doc.id, refBlockId: canonicalDbId };

    const calendarViewId = canonicalDataSource.viewManager.viewAdd('calendar');
    doc.updateBlock(canonicalModel, { currentViewId: calendarViewId });
    await wait(300);

    const newRowButton = document.querySelector(
      '.calendar-empty-month-hint-action'
    ) as HTMLElement | null;
    expect(newRowButton).toBeTruthy();

    const rowCountBefore = canonicalDataSource.rows$.value.length;

    await userEvent.click(newRowButton!);
    await wait(200);

    // `peekViewService.peek()` is called either way — once for navigating
    // to a *doc* (`{docId, ...}`, the buggy behavior: today's journal
    // page, with no title field for the new row), and once for the
    // generic row detail panel (`{target, template}`, rendering this
    // row's own editable title) — so the call itself isn't the signal,
    // the *payload shape* is. The actual bug: this currently gets called
    // with a `docId` (today's journal page) instead of a `template`
    // (the row detail panel the user actually needs to set a title).
    expect(peek).toHaveBeenCalledTimes(1);
    const [payload] = peek.mock.calls[0] as [Record<string, unknown>];
    expect(payload).not.toHaveProperty('docId');
    expect(payload).toHaveProperty('template');

    // The row itself is created regardless of which UI opens afterward —
    // confirms it's not literally missing from the underlying data, just
    // stuck with no way to title it.
    expect(canonicalDataSource.rows$.value.length).toBe(rowCountBefore + 1);
  });
});
