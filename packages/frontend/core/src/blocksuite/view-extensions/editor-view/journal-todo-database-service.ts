import {
  JournalService,
  JournalTodoDatabaseService as JournalTodoDatabaseCoreService,
} from '@affine/core/modules/journal';
import { TemplateDocService } from '@affine/core/modules/template-doc';
import { JournalTodoDatabaseExtension } from '@blocksuite/affine/shared/services';
import type { FrameworkProvider } from '@toeverything/infra';

/**
 * Thin bridge only — reads/writes the workspace-wide "current journal todo
 * database" pointer (`JournalTodoDatabaseService`, `modules/journal`) and
 * the current doc's journal date (`JournalService`). Deliberately does
 * *not* orchestrate "does the stored pointer still resolve to a live
 * block" — that check needs real `std`/`store` access, which only the
 * blocksuite-side slash-menu command (Story 2.4, Task 3) has; this bridge
 * mirrors `patchDatabaseMoveService`'s own minimal-footprint shape.
 */
export function patchJournalTodoDatabaseService(framework: FrameworkProvider) {
  return JournalTodoDatabaseExtension({
    getJournalDate(docId) {
      // `journalDate$` constructs a fresh `LiveData` on every call, which
      // eagerly subscribes to its upstream in the constructor — reading
      // `.value` for a one-off synchronous peek and never disposing would
      // leak that subscription forever. This runs on every slash-menu open
      // inside a journal doc (gates the "Journal Todo" item's visibility),
      // so `.complete()` right after the read is required, not optional.
      const liveData$ = framework.get(JournalService).journalDate$(docId);
      const value = liveData$.value;
      liveData$.complete();
      return value;
    },
    getJournalDocId(date) {
      // Same eager-peek-then-`.complete()` shape as `getJournalDate` above —
      // `journalsByDate$` also constructs a fresh, eagerly-subscribing
      // `LiveData` per call.
      const liveData$ = framework.get(JournalService).journalsByDate$(date);
      const docs = liveData$.value;
      liveData$.complete();
      // Multiple docs can share a journal date (e.g. a stale/trashed
      // duplicate). Prefer a non-trashed doc, and among ties pick the
      // earliest-created one deterministically — `docs[0]` had no ordering
      // guarantee and could resolve to a trashed or arbitrary doc.
      const candidates = docs.filter(doc => !doc.trash$.value);
      const pool = candidates.length ? candidates : docs;
      return pool.sort(
        (a, b) => (a.createdAt$.value ?? 0) - (b.createdAt$.value ?? 0)
      )[0]?.id;
    },
    getJournalTodoDatabaseRef() {
      const ref = framework
        .get(JournalTodoDatabaseCoreService)
        .getJournalTodoDatabaseRef();
      return ref
        ? { refDocId: ref.docId, refBlockId: ref.databaseId }
        : undefined;
    },
    setJournalTodoDatabaseRef(ref) {
      framework
        .get(JournalTodoDatabaseCoreService)
        .setJournalTodoDatabaseRef(
          ref ? { docId: ref.refDocId, databaseId: ref.refBlockId } : undefined
        );
    },
    isTemplateDoc(docId) {
      // Plain synchronous store read (`docProperties.find`, not a
      // `LiveData`/observable) — unlike `getJournalDate`/`getJournalDocId`
      // above, there's no eagerly-subscribing `LiveData` to `.complete()`
      // here.
      return framework
        .get(TemplateDocService)
        .list.listStore.isTemplateDoc(docId);
    },
  });
}
